import { auth } from "@clerk/nextjs/server"
import type { UIMessage } from "ai"

import { ChatThread } from "@/components/chat-thread"
import { getMessagesByChatId } from "@/lib/db/messages"

interface GamePageProps {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    prompt?: string
    model?: string
  }>
}

export default async function GamePage({ params, searchParams }: GamePageProps) {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  const { id } = await params
  const { prompt, model } = await searchParams
  const dbMessages = await getMessagesByChatId(id)
  const initialMessages: UIMessage[] = dbMessages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant" | "system",
    parts: m.parts as UIMessage["parts"],
    metadata: (m.metadata as Record<string, unknown>) ?? undefined,
  }))

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <ChatThread
        id={id}
        initialMessages={initialMessages}
        initialPrompt={prompt}
        initialModel={model}
      />
    </div>
  )
}
