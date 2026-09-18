"use client"

import * as React from "react"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import type { gameChat } from "@/trigger/chat"
import { mintChatAccessToken, startChatSession } from "@/app/actions"

export interface UseChatTransportOptions {
  id?: string
  orgId?: string
  selectedModel: string
  initialPublicAccessToken?: string
  initialLastEventId?: string
}

export function useChatTransport({
  id,
  orgId,
  selectedModel,
  initialPublicAccessToken,
  initialLastEventId,
}: UseChatTransportOptions) {
  const lastKnownEventIdRef = React.useRef<string | undefined>(
    initialLastEventId
  )

  const baseTransport = useTriggerChatTransport<typeof gameChat>({
    task: "game-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({
        chatId,
        clientData: {
          ...clientData,
          orgId,
        },
      }),
    clientData: {
      model: selectedModel,
      orgId,
    },
    sessions:
      id && initialPublicAccessToken
        ? {
            [id]: {
              publicAccessToken: initialPublicAccessToken,
              lastEventId: initialLastEventId,
            },
          }
        : undefined,
    onSessionChange: (_chatId, session) => {
      if (session) {
        if (session.lastEventId) {
          lastKnownEventIdRef.current = session.lastEventId
        } else if (lastKnownEventIdRef.current) {
          session.lastEventId = lastKnownEventIdRef.current
        }
      }
    },
  })

  // Patch reconnectToStream using a Proxy to safely handle React Strict Mode remounts in Next.js dev.
  // In dev mode, React unmounts and remounts components on load. Trigger's reconnectToStream
  // returns null if activeStreams.has(chatId). Because Mount 1's abort teardown is async,
  // Mount 2 sees activeStreams.has(chatId) === true and drops the stream.
  // Aborting and removing any stale controller allows Mount 2 to attach to the live SSE stream.
  // Using a Proxy ensures baseTransport is never mutated directly, maintaining immutability.
  const transport = React.useMemo(() => {
    const activeStreams = (
      baseTransport as unknown as {
        activeStreams?: Map<string, AbortController>
      }
    ).activeStreams

    return new Proxy(baseTransport, {
      get(target, prop, receiver) {
        if (prop === "reconnectToStream") {
          return async (options: Parameters<typeof target.reconnectToStream>[0]) => {
            const existing = activeStreams?.get(options.chatId)
            if (existing) {
              existing.abort()
              activeStreams?.delete(options.chatId)
            }
            return target.reconnectToStream(options)
          }
        }
        const value = Reflect.get(target, prop, receiver)
        if (typeof value === "function") {
          return value.bind(target)
        }
        return value
      },
    })
  }, [baseTransport])

  // Proactively seed the resume cursor so the transport never falls back to sequence 0
  React.useEffect(() => {
    if (id && initialLastEventId && transport) {
      transport.seedResumeCursor(id, initialLastEventId)
    }
  }, [id, initialLastEventId, transport])

  const syncSessionLastEventId = React.useCallback(
    (chatId?: string) => {
      const targetId = chatId || id
      if (targetId && lastKnownEventIdRef.current) {
        const currentSession = transport.getSession(targetId)
        if (currentSession && !currentSession.lastEventId) {
          transport.setSession(targetId, {
            ...currentSession,
            lastEventId: lastKnownEventIdRef.current,
          })
        }
      }
    },
    [id, transport]
  )

  const stopGeneration = React.useCallback(
    (chatId?: string) => {
      const targetId = chatId || id
      if (targetId) {
        void transport.stopGeneration(targetId)
      }
    },
    [id, transport]
  )

  return {
    transport,
    lastKnownEventIdRef,
    syncSessionLastEventId,
    stopGeneration,
  }
}
