"use client"

import * as React from "react"
import Image from "next/image"

import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { ChatComposer } from "@/components/chat-composer"
import { cn } from "@/lib/utils"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "user",
    content:
      "Build an open-world voxel survival game with procedural terrain, day/night cycles, and resource crafting.",
  },
  {
    id: "2",
    role: "assistant",
    content:
      "I've generated the initial 3D voxel gamebox world for you! Here's what has been set up:\n\n• Procedural Voxel Terrain: Multi-layered islands generated using simplex noise with grassy plains and stone caverns.\n• Dynamic Lighting: A directional sun with realistic shadows and an ambient day/night cycle skybox.\n• Mining & Physics: Raycasting block selection with instantaneous voxel destruction and drop animations.\n\nTake a look at the scene in the viewport. What would you like to build or refine next?",
  },
  {
    id: "3",
    role: "user",
    content:
      "Can we add water shaders with wave reflections around the islands, and allow the player to swim?",
  },
  {
    id: "4",
    role: "assistant",
    content:
      "Water physics and volumetric shaders have been integrated!\n\n• Three.js Water Mesh: Added realistic wave displacement with normal maps and dynamic sun reflection.\n• Buoyancy & Swimming: When entering water, gravity is reduced and swimming controls are enabled.\n• Underwater Fog: Added depth-tinted blue fog when the camera goes below the water plane.",
  },
  {
    id: "5",
    role: "user",
    content:
      "That looks fantastic! Can we add a HUD overlay with health hearts and an oxygen gauge when diving?",
  },
  {
    id: "6",
    role: "assistant",
    content:
      "Done! I've added a stylized HUD overlay in the top-left corner:\n\n• Health Meter: 10 heart containers that react to damage.\n• Oxygen Bubble Gauge: Appears when diving underwater, depleting gradually and bubbling back up when surfacing.\n\nYour game is running smoothly at 60 FPS in Three.js.",
  },
]

export interface ChatThreadProps {
  id?: string
  className?: string
}

export function ChatThread({ id, className }: ChatThreadProps) {
  const sendMessage = (value: string) => {
    console.log(`[ChatThread${id ? ` id=${id}` : ""}] sendMessage:`, value)
  }

  return (
    <div className={cn("flex size-full min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1">
        <MessageScrollerProvider>
          <MessageScroller className="size-full">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
                {MOCK_MESSAGES.map((message, index) => {
                  const isAssistant = message.role === "assistant"
                  const isLast = index === MOCK_MESSAGES.length - 1

                  return (
                    <MessageScrollerItem key={message.id} scrollAnchor={isLast}>
                      <Message align={isAssistant ? "start" : "end"}>
                        {isAssistant && (
                          <MessageAvatar className="size-8 self-start rounded-lg bg-transparent">
                            <Image
                              src="/logo.svg"
                              alt="Assistant"
                              width={32}
                              height={32}
                              className="size-8"
                            />
                          </MessageAvatar>
                        )}
                        <MessageContent>
                          <Bubble
                            variant={isAssistant ? "ghost" : "secondary"}
                            align={isAssistant ? "start" : "end"}
                          >
                            <BubbleContent className="text-sm leading-relaxed whitespace-pre-line">
                              {message.content}
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>

      <div className="mx-auto w-full max-w-3xl p-4">
        <ChatComposer
          placeholder="Ask a follow up or describe changes..."
          sendMessage={sendMessage}
        />
      </div>
    </div>
  )
}

export default ChatThread
