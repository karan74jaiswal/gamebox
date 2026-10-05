import { locals, logger } from "@trigger.dev/sdk"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import {
  convertToModelMessages,
  isToolUIPart,
  pruneMessages,
  stepCountIs,
  type Instructions,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai"
import { eq } from "drizzle-orm"
import { z } from "zod"
import * as Sentry from "@sentry/node"

import { getLanguageModel } from "@/lib/ai/provider"
import { sanitizeContext, sanitizeStep } from "@/lib/ai/sanitizer"
import {
  isAbortError,
  isRetryableQuotaError,
  type ResolvedError,
} from "@/lib/ai/errors"
import { resolveError } from "@/lib/ai/errors.server"
import { DEFAULT_MODEL_ID } from "@/lib/ai/models"
import { checkAndSyncOrgCredits, OUT_OF_CREDITS_MESSAGE } from "@/lib/credits"
import { getInitialPromptText } from "@/lib/games/title"
import { instructions } from "@/lib/games/instructions"
import { db, games, withDbRetry } from "@/lib/db"
import { GAME_DIR, getGameSandbox } from "@/lib/daytona/utils"
import { tools, setGameChatContext } from "@/lib/games/tools"
import { reconcileTurnMessages, upsertMessage } from "@/lib/ai/messages"
import { getGameSkills } from "./game-skills"
import {
  chargeStepCredits,
  generateAndPersistGameTitle,
  logTurnFailure,
  prepareStepContext,
} from "./chat-helpers"
import {
  ARCHITECT_SYSTEM_PROMPT,
  ARTIST_SYSTEM_PROMPT,
  ENGINEER_SYSTEM_PROMPT,
  architectTools,
  artistTools,
  engineerTools,
} from "@/lib/games/agents"

const streamErrorKey = locals.create<string>("game-chat.streamError")
const rawStreamErrorKey = locals.create<string>("game-chat.rawStreamError")
const resolvedErrorKey = locals.create<ResolvedError>("game-chat.resolvedError")
const orgIdKey = locals.create<string>("game-chat.orgId")

/**
 * Prepares the model messages and response state for retrying a turn after a mid-stream failure.
 * Crucially guarantees that the conversation strictly terminates with a user or tool turn.
 * Google Gemini / Vertex AI strictly rejects requests ending with an assistant (model) turn:
 * "Requests ending with a model turn are not supported."
 */
async function prepareRetryContext(params: {
  sanitizedMessages: ModelMessage[]
  lastResponseMessage?: UIMessage
  tools?: ToolSet
}): Promise<{
  modelMessages: ModelMessage[]
  retryMessage?: UIMessage
}> {
  const { sanitizedMessages, lastResponseMessage, tools } = params

  if (
    !lastResponseMessage ||
    !Array.isArray(lastResponseMessage.parts) ||
    lastResponseMessage.parts.length === 0
  ) {
    return {
      modelMessages: sanitizedMessages,
      retryMessage: undefined,
    }
  }

  // Find the index of the last completed tool invocation (state === "output-available")
  let lastCompletedToolIdx = -1
  for (let i = lastResponseMessage.parts.length - 1; i >= 0; i--) {
    const p = lastResponseMessage.parts[i]
    if (isToolUIPart(p) && p.state === "output-available") {
      lastCompletedToolIdx = i
      break
    }
  }

  // If no tools completed in this turn, discard the partial assistant message
  // and retry cleanly from the start of the turn (sanitizedMessages).
  if (lastCompletedToolIdx === -1) {
    return {
      modelMessages: sanitizedMessages,
      retryMessage: undefined,
    }
  }

  // Keep only the parts up to the last completed tool
  const trimmedMessage: UIMessage = {
    ...lastResponseMessage,
    parts: lastResponseMessage.parts.slice(0, lastCompletedToolIdx + 1),
  }

  const converted = await convertToModelMessages([trimmedMessage], {
    ignoreIncompleteToolCalls: true,
    ...(tools ? { tools } : {}),
  })

  // Sanitize retried messages to deduplicate superseded tool calls,
  // clean provider options, and ensure Google thought signatures are attached.
  const sanitizedRetryMessages = sanitizeStep([
    ...sanitizedMessages,
    ...converted,
  ])

  // Strip any trailing assistant messages so the request strictly ends with role: "tool"
  while (
    sanitizedRetryMessages.length > 0 &&
    sanitizedRetryMessages[sanitizedRetryMessages.length - 1].role ===
      "assistant"
  ) {
    sanitizedRetryMessages.pop()
  }

  return {
    modelMessages: sanitizedRetryMessages,
    retryMessage: trimmedMessage,
  }
}

interface AgentPhaseParams {
  phaseName: string
  statusText: string
  instructions: Instructions
  tools: ToolSet
  messages: ModelMessage[]
  maxSteps: number
  selectedModel: LanguageModel
  signal?: AbortSignal
  chatId: string
  orgId: string
  modelId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  streamText: (options: any) => any
  lastResponseMessage?: UIMessage
}

/**
 * Executes a single agent phase within a turn, streaming reasoning, tool calls,
 * and text directly to the user UI via Trigger.dev chat.pipeAndCapture.
 * Supports automatic mid-stream pause and resumption for Vertex AI rate limits.
 */
async function runAgentPhase(params: AgentPhaseParams): Promise<{
  success: boolean
  aborted?: boolean
  lastResponseMessage?: UIMessage
}> {
  const {
    phaseName,
    statusText,
    instructions,
    tools: phaseTools,
    messages: phaseMessages,
    maxSteps,
    selectedModel,
    signal,
    chatId,
    orgId,
    modelId,
    streamText,
  } = params

  const MAX_PHASE_RETRIES = 3
  let currentModelMessages = phaseMessages
  let lastError: unknown
  let currentResponse = params.lastResponseMessage

  // Stream user-facing status indicator
  chat.response.write({
    type: "data-step-status",
    id: "step-status",
    data: { text: statusText },
    transient: true,
  })

  for (let attempt = 0; attempt < MAX_PHASE_RETRIES; attempt++) {
    if (signal?.aborted || chat.isStopped()) {
      return {
        success: false,
        aborted: true,
        lastResponseMessage: currentResponse,
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = streamText({
        model: selectedModel,
        tools: phaseTools,
        instructions,
        messages: currentModelMessages,
        abortSignal: signal,

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onLanguageModelCallStart: (event: any) => {
          const rawInstructions = event.instructions
          const systemPromptText =
            typeof rawInstructions === "string"
              ? rawInstructions
              : Array.isArray(rawInstructions)
                ? rawInstructions
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((m: any) =>
                      typeof m === "object" && m && "content" in m
                        ? String(m.content)
                        : JSON.stringify(m)
                    )
                    .join("\n\n---\n\n")
                : typeof rawInstructions === "object" &&
                    rawInstructions &&
                    "content" in rawInstructions
                  ? String((rawInstructions as { content: unknown }).content)
                  : JSON.stringify(rawInstructions)

          const toolNames = event.tools
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              event.tools
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((t: any) => (t as { name?: string }).name)
                .filter(Boolean)
            : []

          logger.info(
            `==================== [LLM CALL: ${phaseName.toUpperCase()}] (Chat: ${chatId} | Attempt: ${attempt + 1}) ====================`,
            {
              phase: phaseName,
              attempt: attempt + 1,
              provider: event.provider,
              modelId: event.modelId,
              callId: event.callId,
              systemPrompt: systemPromptText,
              toolNames,
              toolsCount: toolNames.length,
              messagesCount: event.messages?.length ?? 0,
            }
          )
        },

        stopWhen: stepCountIs(maxSteps),
        maxRetries: 4,

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prepareStep: async ({ messages: stepMessages, steps }: any) =>
          prepareStepContext({ messages: stepMessages, steps, chatId }),

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onStepFinish: async (step: any) =>
          chargeStepCredits(step, { orgId, chatId, modelId }),

        providerOptions: {
          vertex: {
            thinkingConfig: {
              includeThoughts: true,
            },
          },
          google: {
            store: false,
            thinkingConfig: {
              includeThoughts: true,
            },
            thinkingLevel: "high",
            thinkingSummaries: "auto",
          },
        },
      })

      const pipeResult = await chat.pipeAndCapture(result, {
        signal,
        originalMessages: currentResponse
          ? upsertMessage(chat.history.all(), currentResponse)
          : chat.history.all(),
      })

      if (pipeResult.message) {
        currentResponse = pipeResult.message
      }

      if (
        signal?.aborted ||
        chat.isStopped() ||
        pipeResult.status === "aborted"
      ) {
        return {
          success: false,
          aborted: true,
          lastResponseMessage: currentResponse,
        }
      }

      const streamError = locals.get(streamErrorKey)
      const rawStreamError = locals.get(rawStreamErrorKey)
      const storedResolvedError = locals.get(resolvedErrorKey)

      const isErrorFinish =
        pipeResult.status === "error" ||
        pipeResult.finishReason === "error" ||
        pipeResult.finishReason === "other" ||
        Boolean(pipeResult.error) ||
        Boolean(streamError) ||
        Boolean(storedResolvedError)

      if (!isErrorFinish && pipeResult.status === "complete") {
        return { success: true, lastResponseMessage: currentResponse }
      }

      lastError =
        pipeResult.error ||
        rawStreamError ||
        streamError ||
        (pipeResult.finishReason
          ? new Error(
              `Stream terminated prematurely with finishReason: ${pipeResult.finishReason}`
            )
          : new Error("Stream interrupted"))

      const isQuotaOrInterrupted =
        isRetryableQuotaError(lastError, pipeResult.finishReason) ||
        storedResolvedError?.category === "rate_limit"

      if (!isQuotaOrInterrupted || attempt >= MAX_PHASE_RETRIES - 1) {
        if (lastError) throw lastError
        return { success: false, lastResponseMessage: currentResponse }
      }

      locals.set(streamErrorKey, undefined)
      locals.set(rawStreamErrorKey, undefined)
      locals.set(resolvedErrorKey, undefined)

      const waitSec = 20 + attempt * 5
      logger.warn(
        `Vertex AI rate-limit/interruption in ${phaseName} (attempt ${attempt + 1}/${MAX_PHASE_RETRIES}). Pausing ${waitSec}s to replenish quota...`,
        {
          chatId,
          attempt: attempt + 1,
          finishReason: pipeResult.finishReason,
          error:
            lastError instanceof Error ? lastError.message : String(lastError),
        }
      )

      chat.response.write({
        type: "data-step-status",
        id: "step-status",
        data: {
          text: `Pausing to replenish quota before continuing ${phaseName}...`,
        },
        transient: true,
      })

      await new Promise((r) => setTimeout(r, waitSec * 1000))

      const { modelMessages, retryMessage } = await prepareRetryContext({
        sanitizedMessages: phaseMessages,
        lastResponseMessage: currentResponse,
        tools: phaseTools,
      })
      currentResponse = retryMessage
      currentModelMessages = modelMessages
    } catch (err) {
      lastError = err
      if (signal?.aborted || chat.isStopped()) {
        return {
          success: false,
          aborted: true,
          lastResponseMessage: currentResponse,
        }
      }
      const isQuotaOrInterrupted = isRetryableQuotaError(err)
      if (!isQuotaOrInterrupted || attempt >= MAX_PHASE_RETRIES - 1) {
        throw err
      }

      locals.set(streamErrorKey, undefined)
      locals.set(rawStreamErrorKey, undefined)
      locals.set(resolvedErrorKey, undefined)

      const waitSec = 20 + attempt * 5
      logger.warn(
        `Vertex AI threw retryable error in ${phaseName} (attempt ${attempt + 1}/${MAX_PHASE_RETRIES}). Waiting ${waitSec}s...`,
        { error: err instanceof Error ? err.message : String(err) }
      )

      chat.response.write({
        type: "data-step-status",
        id: "step-status",
        data: {
          text: "Preparing next step...",
        },
        transient: true,
      })

      await new Promise((r) => setTimeout(r, waitSec * 1000))
    }
  }

  return { success: false, lastResponseMessage: currentResponse }
}

export const gameChat = chat.agent({
  id: "game-chat",
  tools,

  clientDataSchema: z.object({
    model: z.string().optional(),
    provider: z.string().optional(),
    orgId: z.string().optional(),
  }),
  hydrateMessages: async ({
    chatId,
    trigger,
    incomingMessages,
    clientData,
  }) => {
    const orgId = clientData?.orgId || locals.get(orgIdKey)
    if (!orgId) {
      throw new Error(
        `Cannot run chat turn: Missing organization ID for game ${chatId}`
      )
    }

    locals.set(orgIdKey, orgId)
    const creditCheck = await checkAndSyncOrgCredits(orgId)
    if (!creditCheck.allowed) {
      logger.warn(
        `==================== [TURN BLOCKED: OUT OF CREDITS] (Chat: ${chatId} | Org: ${orgId} | Balance: ${creditCheck.balance.toString()} nano-dollars) ====================`
      )
      Sentry.logger.info(
        "Game chat turn blocked in hydrateMessages: org out of credits",
        {
          chatId,
          orgId,
          balance: creditCheck.balance.toString(),
          synced: creditCheck.synced,
        }
      )
      throw new Error(`OUT_OF_CREDITS: ${OUT_OF_CREDITS_MESSAGE}`)
    }

    const [record] = await withDbRetry(
      () =>
        db
          .select({ messages: games.messages })
          .from(games)
          .where(eq(games.id, chatId))
          .limit(1),
      "hydrateMessages:select"
    )
    const stored = (record?.messages as UIMessage[]) ?? []

    if (upsertIncomingMessage(stored, { trigger, incomingMessages })) {
      try {
        await withDbRetry(
          () =>
            db
              .update(games)
              .set({ messages: stored, updatedAt: new Date() })
              .where(eq(games.id, chatId)),
          "hydrateMessages:update"
        )
      } catch (err) {
        Sentry.logger.error(
          "Failed to persist incoming message during hydration in chat",
          {
            chatId,
            error: err instanceof Error ? err.message : String(err),
          }
        )
      }
    }

    return stored
  },
  onChatStart: async ({ chatId, messages, writer }) => {
    Sentry.logger.info("Game chat session started", { chatId })
    const sandbox = await getGameSandbox(chatId)
    setGameChatContext(chatId, sandbox)
    writer.write({
      type: "data-game-sandbox",
      id: "game-sandbox",
      data: { id: chatId, sandboxId: sandbox.id },
      transient: true,
    })

    const promptText = getInitialPromptText(messages)
    if (promptText) {
      chat.defer(() => generateAndPersistGameTitle(chatId, promptText))
    }
  },
  onTurnStart: async ({ chatId, uiMessages, clientData }) => {
    locals.set(streamErrorKey, undefined)
    locals.set(rawStreamErrorKey, undefined)
    locals.set(resolvedErrorKey, undefined)
    setGameChatContext(chatId)

    const resolvedSkills = await getGameSkills()
    chat.skills.set(resolvedSkills)

    const orgId = clientData?.orgId || locals.get(orgIdKey)
    if (orgId) {
      locals.set(orgIdKey, orgId)
    }

    // Persist full accumulated history (including user message or answered tool output)
    // before the model runs, guaranteeing that a mid-stream refresh reads the updated state.
    await withDbRetry(
      () =>
        db
          .update(games)
          .set({ messages: uiMessages, updatedAt: new Date() })
          .where(eq(games.id, chatId)),
      "onTurnStart:update"
    )

    Sentry.logger.info("Game chat turn started", {
      chatId,
      orgId: locals.get(orgIdKey),
    })
  },

  onBeforeTurnComplete: async ({
    writer,
    chatId,
    stopped,
    finishReason,
    error,
  }) => {
    const streamError = locals.get(streamErrorKey)
    const storedResolved = locals.get(resolvedErrorKey)
    const wasStopped = Boolean(stopped) || chat.isStopped()
    const isAbnormalFinish =
      finishReason === "error" ||
      finishReason === "length" ||
      finishReason === "content-filter" ||
      finishReason === "other"
    if (!wasStopped && (Boolean(error) || isAbnormalFinish)) {
      const resolved =
        (error ? resolveError(error, finishReason) : undefined) ??
        storedResolved ??
        resolveError(streamError || undefined, finishReason)
      writer.write({
        type: "data-turn-error",
        id: "turn-error",
        data: {
          id: chatId,
          errorText: resolved.userMessage,
          category: resolved.category,
          errorType: resolved.errorType,
          statusCode: resolved.statusCode,
          code: resolved.code,
        },
        transient: true,
      })
    }
  },
  uiMessageStreamOptions: {
    sendReasoning: true,

    onError: (error) => {
      if (isAbortError(error) || chat.isStopped()) {
        locals.set(streamErrorKey, undefined)
        locals.set(rawStreamErrorKey, undefined)
        locals.set(resolvedErrorKey, undefined)
        return ""
      }
      const resolved = resolveError(error)
      locals.set(resolvedErrorKey, resolved)
      locals.set(streamErrorKey, resolved.userMessage)
      locals.set(rawStreamErrorKey, resolved.rawMessage)

      // Capture model stream errors in Sentry as tracked issues
      Sentry.captureException(error, {
        tags: {
          location: "game-chat.uiMessageStreamOptions.onError",
          category: resolved.category,
          errorType: resolved.errorType,
          statusCode: String(resolved.statusCode ?? "unknown"),
          code: resolved.code ?? "none",
        },
        extra: {
          rawError: resolved.rawMessage,
          details: resolved.details,
        },
      })
      Sentry.logger.error("Game chat model stream error", {
        category: resolved.category,
        errorType: resolved.errorType,
        statusCode: resolved.statusCode,
        code: resolved.code,
        error: resolved.rawMessage,
      })
      return resolved.userMessage
    },
  },

  onTurnComplete: async ({
    chatId,
    uiMessages,
    lastEventId,
    clientData,
    error,
    finishReason,
    stopped,
  }) => {
    const streamError = locals.get(streamErrorKey)
    const rawStreamError = locals.get(rawStreamErrorKey)
    const storedResolvedError = locals.get(resolvedErrorKey)
    locals.set(streamErrorKey, undefined)
    locals.set(rawStreamErrorKey, undefined)
    locals.set(resolvedErrorKey, undefined)

    const wasStopped =
      Boolean(stopped) || chat.isStopped() || isAbortError(error)

    const isAbnormalFinish =
      finishReason === "error" ||
      finishReason === "length" ||
      finishReason === "content-filter" ||
      finishReason === "other"

    const isFailedTurn = !wasStopped && (Boolean(error) || isAbnormalFinish)

    let resolvedError: ResolvedError | undefined
    if (isFailedTurn) {
      resolvedError =
        (error ? resolveError(error, finishReason) : undefined) ??
        storedResolvedError ??
        resolveError(rawStreamError || streamError || undefined, finishReason)

      logTurnFailure({
        chatId,
        error,
        finishReason,
        resolved: resolvedError,
        clientData,
      })
    }

    const finalMessages = reconcileTurnMessages({
      uiMessages,
      wasStopped,
      isFailedTurn,
      resolvedError,
    })

    await withDbRetry(
      () =>
        db
          .update(games)
          .set({
            messages: finalMessages,
            lastEventId: lastEventId ?? null,
            ...(clientData?.model ? { model: clientData.model } : {}),
            updatedAt: new Date(),
          })
          .where(eq(games.id, chatId)),
      "onTurnComplete:update"
    )

    chat.history.set(finalMessages)

    // Checkpoint turn changes in Git so status reflects only current-turn modifications
    try {
      const sandbox = await getGameSandbox(chatId)
      const status = await sandbox.git.status(GAME_DIR)
      const hasChanges = Boolean(
        status.fileStatus && status.fileStatus.length > 0
      )
      if (hasChanges) {
        await sandbox.git.add(GAME_DIR, ["."])
        const commitRes = await sandbox.git.commit(
          GAME_DIR,
          `Turn checkpoint: ${finishReason || "completed"}`,
          "Gamebox",
          "bot@gamebox.dev",
          false
        )
        logger.info(
          `Git checkpoint committed for game ${chatId}: ${commitRes.sha}`
        )
      }
    } catch (gitErr) {
      logger.warn(`Turn git checkpoint skipped or failed for game ${chatId}`, {
        error: gitErr instanceof Error ? gitErr.message : String(gitErr),
      })
    }

    logger.info(
      `==================== [TURN COMPLETE] (Chat: ${chatId} | Finish: ${finishReason || "unknown"}) ====================`
    )
    Sentry.logger.info("Game chat turn completed", {
      chatId,
      finishReason: finishReason || "unknown",
      wasStopped,
      isFailedTurn,
      messageCount: finalMessages.length,
    })
  },

  run: async ({ messages, tools, signal, clientData, chatId, streamText }) => {
    setGameChatContext(chatId)

    const orgId = clientData?.orgId || locals.get(orgIdKey)
    if (!orgId) {
      throw new Error(
        `Cannot run chat turn: Missing organization ID for game ${chatId}`
      )
    }

    const modelId = clientData?.model || DEFAULT_MODEL_ID

    Sentry.logger.info("Game chat model stream initiated", {
      chatId,
      orgId,
      messageCount: messages.length,
      model: clientData?.model || "default",
      provider: clientData?.provider || "default",
    })

    const selectedModel = getLanguageModel(
      clientData?.provider,
      clientData?.model
    )

    const sanitizedMessages = sanitizeContext(messages)
    logger.info(
      `==================== [TURN START: LLM CONTEXT] (Chat: ${chatId}) ====================`,
      {
        totalMessages: sanitizedMessages.length,
        rawInputCount: messages.length,
        messages: sanitizedMessages,
      }
    )

    const activeSkills = chat.skills()
    logger.info(
      `==================== [TRIGGER.DEV SKILLS ACTIVE] (Chat: ${chatId}) ====================`,
      {
        skillCount: activeSkills?.length ?? 0,
        skills: activeSkills?.map((s) => ({
          id: s.id,
          name: s.frontmatter.name,
          description: s.frontmatter.description,
        })),
      }
    )

    const userMessages = sanitizedMessages.filter((m) => m.role === "user")
    const isInitialTurn = userMessages.length <= 1

    let lastResponseMessage: UIMessage | undefined

    if (isInitialTurn) {
      // -------------------------------------------------------------
      // TURN 1: Sequential 3-Agent Collaborative Pipeline
      // Phase 1 (Game Architect) -> Phase 2 (Art Director) -> Phase 3 (Gameplay Engineer)
      // -------------------------------------------------------------
      const userPromptText =
        getInitialPromptText(sanitizedMessages) || "Create a 3D game"

      // PHASE 1: Game Director & Architect
      const phase1 = await runAgentPhase({
        phaseName: "Phase 1: Game Architect",
        statusText: "Phase 1/3: Designing game architecture & visual plan...",
        instructions: ARCHITECT_SYSTEM_PROMPT,
        tools: architectTools,
        messages: sanitizedMessages,
        maxSteps: 15,
        selectedModel,
        signal,
        chatId,
        orgId,
        modelId,
        streamText,
        lastResponseMessage,
      })

      lastResponseMessage = phase1.lastResponseMessage
      if (phase1.aborted || signal?.aborted || chat.isStopped()) {
        if (lastResponseMessage) {
          chat.history.set(
            upsertMessage(chat.history.all(), lastResponseMessage)
          )
        }
        return
      }

      // Read the newly minted architecture plan from sandbox disk
      let planContent = ""
      try {
        const sandbox = await getGameSandbox(chatId)
        const planBuf = await sandbox.fs.downloadFile(
          `${GAME_DIR}/artifacts/game-plan.md`
        )
        planContent = planBuf.toString("utf-8")
      } catch (err) {
        logger.warn(
          `artifacts/game-plan.md not found on disk after Agent 1: ${err}`,
          { chatId }
        )
      }

      // PHASE 2: Art Director & Asset Specialist
      const artistUserPrompt = planContent
        ? `User Game Request: "${userPromptText}"

Agent 1 (Game Director & Architect) has generated the game design specification in artifacts/game-plan.md:

${planContent}

As the Art Director & Asset Specialist:
1. Generate the visual textures specified in the Asset Manifest using \`generate_texture\` (e.g. for environment/ground, player/hero, obstacles/structures).
2. Generate the background music/audio specified in the Asset Manifest using \`generate_music\`.
3. Update artifacts/game-plan.md using \`write_file\` to record the generated assets with their verified paths.
Maintain strict adherence to the 3-color palette and aesthetic theme.`
        : `User Game Request: "${userPromptText}"

Agent 1 (Game Director & Architect) has completed the initial game design.
As the Art Director & Asset Specialist:
1. Read artifacts/game-plan.md using \`read_file\` to inspect the asset requirements.
2. Generate the visual textures using \`generate_texture\`.
3. Generate the background music using \`generate_music\`.
4. Update artifacts/game-plan.md to record the generated assets.`

      const artistMessages: ModelMessage[] = [
        {
          role: "user",
          content: artistUserPrompt,
        },
      ]

      const phase2 = await runAgentPhase({
        phaseName: "Phase 2: Art Director",
        statusText: "Phase 2/3: Generating 3D textures & audio...",
        instructions: ARTIST_SYSTEM_PROMPT,
        tools: artistTools,
        messages: artistMessages,
        maxSteps: 25,
        selectedModel,
        signal,
        chatId,
        orgId,
        modelId,
        streamText,
        lastResponseMessage,
      })

      lastResponseMessage = phase2.lastResponseMessage
      if (phase2.aborted || signal?.aborted || chat.isStopped()) {
        if (lastResponseMessage) {
          chat.history.set(
            upsertMessage(chat.history.all(), lastResponseMessage)
          )
        }
        return
      }

      // Read updated plan from sandbox disk
      let updatedPlanContent = planContent
      try {
        const sandbox = await getGameSandbox(chatId)
        const planBuf = await sandbox.fs.downloadFile(
          `${GAME_DIR}/artifacts/game-plan.md`
        )
        updatedPlanContent = planBuf.toString("utf-8")
      } catch {
        // Fallback to initial planContent
      }

      // PHASE 3: Lead Gameplay & Three.js Engineer
      const engineerUserPrompt = `User Game Request: "${userPromptText}"

The Game Architecture Plan and visual/audio assets are ready.
Here is the current artifacts/game-plan.md:

${updatedPlanContent}

As the Lead Gameplay Engineer:
1. Inspect the generated textures in \`assets/textures/\` and music in \`assets/audio/\`.
2. Implement the complete, high-tension 60 FPS Three.js game adhering strictly to the architecture plan, 3-color lighting, diegetic HUD, and 5-state lifecycle.
3. Run \`verify_game\` to ensure zero compilation or runtime errors.
4. Update \`artifacts/game-state.md\` with the implementation status and mechanics summary.
5. Provide a concise summary of the finished game to the player.`

      const engineerMessages: ModelMessage[] = [
        {
          role: "user",
          content: engineerUserPrompt,
        },
      ]

      const phase3 = await runAgentPhase({
        phaseName: "Phase 3: Lead Gameplay Engineer",
        statusText: "Phase 3/3: Implementing gameplay & verifying engine...",
        instructions: ENGINEER_SYSTEM_PROMPT,
        tools: engineerTools,
        messages: engineerMessages,
        maxSteps: 100,
        selectedModel,
        signal,
        chatId,
        orgId,
        modelId,
        streamText,
        lastResponseMessage,
      })

      lastResponseMessage = phase3.lastResponseMessage
      if (lastResponseMessage) {
        chat.history.set(upsertMessage(chat.history.all(), lastResponseMessage))
      }
      return
    }

    // -------------------------------------------------------------
    // TURN 2+: Surgical Bug Fixing & Controls Iteration
    // Agent 3 (Lead Gameplay Engineer) executes directly.
    // -------------------------------------------------------------
    const prunedTurnMessages = pruneMessages({
      messages: sanitizedMessages,
      reasoning: "before-last-message",
      emptyMessages: "remove",
    })

    const phase = await runAgentPhase({
      phaseName: "Gameplay Engineer (Iteration)",
      statusText: "Analyzing code & applying gameplay updates...",
      instructions: ENGINEER_SYSTEM_PROMPT,
      tools: engineerTools,
      messages: prunedTurnMessages,
      maxSteps: 100,
      selectedModel,
      signal,
      chatId,
      orgId,
      modelId,
      streamText,
      lastResponseMessage,
    })

    if (phase.lastResponseMessage) {
      chat.history.set(
        upsertMessage(chat.history.all(), phase.lastResponseMessage)
      )
    }
  },
})
