"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Grip, ChevronDown, ArrowUp, Square } from "lucide-react"

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
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, resolveModel } from "@/lib/ai/models"
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
  disabled?: boolean
  status?: string
  onStop?: () => void
  model?: string
  onModelChange?: (model: string) => void
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
  disabled = false,
  status,
  onStop,
  model: controlledModel,
  onModelChange,
}: ChatComposerProps = {}) {
  const router = useRouter()
  const [internalPrompt, setInternalPrompt] = React.useState("")
  const [internalModel, setInternalModel] = React.useState(
    controlledModel || DEFAULT_MODEL_ID
  )
  const [isPending, startTransition] = React.useTransition()

  const activeModelId = controlledModel || internalModel
  const activeModel = resolveModel(activeModelId)

  const handleModelSelect = (id: string) => {
    setInternalModel(id)
    onModelChange?.(id)
  }

  const isStreaming = status === "streaming" || status === "submitted"

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
    if (!content || isPending || isStreaming) return

    const sendAction = onSendMessage || sendMessage

    startTransition(async () => {
      try {
        if (sendAction) {
          await sendAction(content, { model: activeModel.id })
        } else {
          const newGame = await createGame({ title: content })
          if (newGame?.id) {
            const params = new URLSearchParams()
            params.set("prompt", content)
            params.set("model", activeModel.id)
            router.push(`/games/${newGame.id}?${params.toString()}`)
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
              if (!isStreaming) {
                handleSubmit()
              }
            }
          }}
          disabled={isPending || disabled}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <InputGroupButton variant="ghost" disabled={isStreaming}>
                  <Grip />
                  <span className="max-w-[140px] truncate">{activeModel.label}</span>
                  <ChevronDown />
                </InputGroupButton>
              }
            />
            <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
              {AVAILABLE_MODELS.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => handleModelSelect(item.id)}
                  className="flex flex-col items-start gap-0.5 py-1.5 cursor-pointer"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-medium text-sm">{item.label}</span>
                    {activeModel.id === item.id && (
                      <span className="text-xs text-primary font-bold">✓</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground line-clamp-1">
                    {item.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {isStreaming && onStop ? (
            <InputGroupButton
              size="icon-sm"
              variant="default"
              className="rounded-full"
              onClick={onStop}
              title="Stop generating"
            >
              <Square className="size-3.5 fill-current" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              size="icon-sm"
              variant="default"
              className="rounded-full"
              disabled={!currentValue.trim() || isPending || disabled}
              onClick={handleSubmit}
            >
              <ArrowUp />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

export default ChatComposer
