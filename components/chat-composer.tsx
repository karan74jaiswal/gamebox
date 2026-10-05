"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Grip, ChevronDown, ArrowUp, Square, Loader2 } from "lucide-react"
import * as Sentry from "@sentry/nextjs"

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
import {
  AVAILABLE_MODELS,
  DEFAULT_MODEL_ID,
  resolveModel,
} from "@/lib/ai/models"
import { createGame } from "@/lib/games/actions"
import { cn } from "@/lib/utils"

export interface ChatComposerProps {
  input?: string
  onInputChange?: (value: string) => void
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  sendMessage?: (
    value: string,
    options?: { model?: string }
  ) => void | Promise<void>

  disabled?: boolean
  isOutOfCredits?: boolean
  status?: string
  onStop?: () => void
  onCancel?: () => void
  model?: string
  onModelChange?: (model: string) => void
  onCreatingChange?: (isCreating: boolean) => void
}

export function ChatComposer({
  input: controlledInput,
  onInputChange,
  onChange,
  placeholder = "Describe the game you want to build...",
  className,
  sendMessage,
  disabled = false,
  isOutOfCredits = false,
  status,
  onStop,
  onCancel,
  model: controlledModel,
  onModelChange,
  onCreatingChange,
}: ChatComposerProps = {}) {
  const router = useRouter()
  const [internalPrompt, setInternalPrompt] = React.useState("")
  const [internalModel, setInternalModel] = React.useState(
    controlledModel || DEFAULT_MODEL_ID
  )
  const [isCreating, setIsCreating] = React.useState(false)
  const [isPending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (controlledModel) {
      setInternalModel(controlledModel)
    }
  }, [controlledModel])

  const activeModelId = controlledModel || internalModel
  const activeModel = resolveModel(activeModelId)

  const handleModelSelect = (id: string) => {
    setInternalModel(id)
    onModelChange?.(id)
  }

  const isStreaming = status === "streaming" || status === "submitted"
  const handleCancel = onCancel || onStop

  const isControlled = controlledInput !== undefined
  const currentValue =
    controlledInput !== undefined ? controlledInput : internalPrompt

  const handleInputChange = (newValue: string) => {
    if (!isControlled) setInternalPrompt(newValue)

    onInputChange?.(newValue)
    onChange?.(newValue)
  }

  const isInputDisabled = disabled || isOutOfCredits
  const activePlaceholder = isOutOfCredits ? "Out of credits" : placeholder

  const handleSubmit = () => {
    const content = currentValue.trim()
    if (!content || isPending || isStreaming || isInputDisabled || isCreating) return

    if (!sendMessage) {
      setIsCreating(true)
      onCreatingChange?.(true)
    }

    startTransition(async () => {
      try {
        if (sendMessage) {
          await sendMessage(content, { model: activeModel.id })
        } else {
          const newGame = await createGame({
            title: content,
            model: activeModel.id,
          })
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
        setIsCreating(false)
        onCreatingChange?.(false)
        Sentry.logger.error(
          sendMessage ? "Failed to send message" : "Failed to create game",
          {
            operation: sendMessage ? "sendMessage" : "createGame",
            error: error instanceof Error ? error.message : String(error),
          }
        )
      }
    })
  }

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <InputGroup
        className={cn(
          "bg-popover transition-all duration-300",
          isCreating &&
            "border-primary/60 shadow-[0_0_25px_-5px_rgba(var(--primary),0.3)] ring-1 ring-primary/40"
        )}
      >
        <InputGroupTextarea
          className="field-sizing-content max-h-48 min-h-10"
          rows={1}
          placeholder={isCreating ? "Launching workspace..." : activePlaceholder}
          value={currentValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              if (!isStreaming && !isInputDisabled && !isPending && !isCreating)
                handleSubmit()
            } else if (e.key === "Escape" && isStreaming && handleCancel) {
              e.preventDefault()
              handleCancel()
            }
          }}
          disabled={isPending || isInputDisabled || isCreating}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <InputGroupButton
                  variant="ghost"
                  disabled={isStreaming || disabled || isCreating}
                >
                  <Grip />
                  <span className="max-w-[140px] truncate">
                    {activeModel.label}
                  </span>
                  <ChevronDown />
                </InputGroupButton>
              }
            />
            <DropdownMenuContent
              align="start"
              className="max-h-80 w-64 overflow-y-auto"
            >
              {AVAILABLE_MODELS.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => handleModelSelect(item.id)}
                  className="flex cursor-pointer flex-col items-start gap-0.5 py-1.5"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-medium">{item.label}</span>
                    {activeModel.id === item.id && (
                      <span className="text-xs font-bold text-primary">✓</span>
                    )}
                  </div>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {isCreating ? (
            <InputGroupButton
              size="icon-sm"
              variant="default"
              className="rounded-full pointer-events-none"
              disabled
            >
              <Loader2 className="size-3.5 animate-spin text-primary-foreground" />
            </InputGroupButton>
          ) : isStreaming && handleCancel ? (
            <InputGroupButton
              size="icon-sm"
              variant="default"
              className="rounded-full"
              onClick={handleCancel}
              title="Cancel generation"
            >
              <Square className="size-3.5 fill-current" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              size="icon-sm"
              variant="default"
              className="rounded-full"
              disabled={
                !currentValue.trim() || isPending || isInputDisabled || isCreating
              }
              onClick={handleSubmit}
            >
              <ArrowUp />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>

      {isCreating && (
        <div className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground animate-in fade-in slide-in-from-top-1.5 duration-300">
          <Loader2 className="size-3 animate-spin text-primary" />
          <span>Launching game workspace & sandbox...</span>
        </div>
      )}
    </div>
  )
}

export default ChatComposer
