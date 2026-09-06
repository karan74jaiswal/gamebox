"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Grip, ChevronDown, ArrowUp } from "lucide-react"

import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { createGame } from "@/lib/games/actions"
import { cn } from "@/lib/utils"

export interface ChatComposerProps {
  input?: string
  onInputChange?: (value: string) => void
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  sendMessage?: (value: string, options?: { model?: string }) => void | Promise<void>
  onSendMessage?: (value: string, options?: { model?: string }) => void | Promise<void>
}

export function ChatComposer({
  input: controlledInput,
  onInputChange,
  value: controlledValue,
  onChange,
  placeholder = "Describe the game you want to build...",
  className,
  sendMessage,
  onSendMessage,
}: ChatComposerProps = {}) {
  const router = useRouter()
  const [internalPrompt, setInternalPrompt] = React.useState("")
  const [model, setModel] = React.useState("Kimi K3")
  const [isPending, startTransition] = React.useTransition()

  const isControlled =
    controlledInput !== undefined || controlledValue !== undefined
  const currentValue =
    controlledInput !== undefined
      ? controlledInput
      : controlledValue !== undefined
        ? controlledValue
        : internalPrompt

  const handleInputChange = (newValue: string) => {
    if (!isControlled) {
      setInternalPrompt(newValue)
    }
    onInputChange?.(newValue)
    onChange?.(newValue)
  }

  const handleSubmit = () => {
    const content = currentValue.trim()
    if (!content || isPending) return

    const sendAction = onSendMessage || sendMessage

    startTransition(async () => {
      try {
        if (sendAction) {
          await sendAction(content, { model })
        } else {
          const newGame = await createGame({ title: content })
          if (newGame?.id) {
            router.push(`/games/${newGame.id}`)
          }
        }
        if (!isControlled) {
          setInternalPrompt("")
        }
        onInputChange?.("")
        onChange?.("")
      } catch (error) {
        console.error(
          sendAction ? "Failed to send message:" : "Failed to create game:",
          error
        )
      }
    })
  }

  return (
    <div className={cn("flex w-full flex-col gap-6", className)}>
      <InputGroup className="bg-popover">
        <InputGroupTextarea
          className="field-sizing-content max-h-48 min-h-10"
          rows={1}
          placeholder={placeholder}
          value={currentValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          disabled={isPending}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <InputGroupButton variant="ghost">
                  <Grip />
                  <span>{model}</span>
                  <ChevronDown />
                </InputGroupButton>
              }
            />
            <DropdownMenuContent align="start">
              {["Kimi K3", "Claude 3.7 Sonnet", "Claude 3.5 Sonnet", "GPT-4o"].map(
                (item) => (
                  <DropdownMenuItem
                    key={item}
                    onClick={() => setModel(item)}
                  >
                    {item}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <InputGroupButton
            size="icon-sm"
            variant="default"
            className="rounded-full"
            disabled={!currentValue.trim() || isPending}
            onClick={handleSubmit}
          >
            <ArrowUp />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

export default ChatComposer
