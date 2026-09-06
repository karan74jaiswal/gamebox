"use client"

import * as React from "react"
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
}

export function ChatComposer({
  input: controlledInput,
  onInputChange,
  value: controlledValue,
  onChange,
  placeholder = "Describe the game you want to build...",
  className,
}: ChatComposerProps = {}) {
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

  const handleCreate = () => {
    const title = currentValue.trim()
    if (!title || isPending) return

    startTransition(async () => {
      try {
        await createGame({ title })
        if (!isControlled) {
          setInternalPrompt("")
        }
        onInputChange?.("")
        onChange?.("")
      } catch (error) {
        console.error("Failed to create game:", error)
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
              handleCreate()
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
            onClick={handleCreate}
          >
            <ArrowUp />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

export default ChatComposer
