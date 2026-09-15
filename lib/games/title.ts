import { generateText, type ModelMessage } from "ai"
import * as Sentry from "@sentry/nextjs"

import { getLanguageModel } from "@/lib/ai/provider"

/**
 * Extracts the raw prompt string from the first user message,
 * handling both plain string content and multi-part content arrays.
 */
export function getInitialPromptText(messages: ModelMessage[]): string {
  const firstUserMessage = messages.find((m) => m.role === "user")
  if (!firstUserMessage) return ""

  if (typeof firstUserMessage.content === "string") {
    return firstUserMessage.content.trim()
  }

  if (Array.isArray(firstUserMessage.content)) {
    return firstUserMessage.content
      .filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" && typeof p.text === "string"
      )
      .map((p) => p.text)
      .join(" ")
      .trim()
  }

  return ""
}

/**
 * Generates a concise, catchy game title (2 to 5 words) based on the game description.
 */
export async function generateGameTitle(
  promptText: string
): Promise<string | null> {
  const cleanPrompt = promptText.trim()
  if (!cleanPrompt) return null

  try {
    const model = getLanguageModel("google/gemini-2.5-flash")

    const { text } = await generateText({
      model,
      system:
        "You are a creative game title generator. Generate a concise, catchy game title (2 to 5 words) for the provided game description. Output ONLY the title, with no quotes, markdown formatting, or ending punctuation.",
      prompt: `Game description: ${cleanPrompt}`,
    })

    const title = text
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/[.]+$/, "")
      .trim()

    if (title) {
      Sentry.logger.info("Background game title generated", {
        title,
        promptLength: cleanPrompt.length,
      })
    }

    return title || null
  } catch (error) {
    Sentry.logger.error("Background game title generation failed", {
      promptLength: cleanPrompt.length,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
