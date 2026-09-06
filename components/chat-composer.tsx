"use client"

import * as React from "react"
import {
  Pickaxe,
  Swords,
  Zap,
  Plane,
  Crosshair,
  Car,
  Gamepad2,
  Grip,
  ChevronDown,
  ArrowUp,
} from "lucide-react"

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
import { Button } from "@/components/ui/button"
import { createGame } from "@/lib/games/actions"

const SUGGESTIONS = [
  [
    { label: "Voxel survival", icon: Pickaxe },
    { label: "Ink samurai duel", icon: Swords },
    { label: "Comic-book firefight", icon: Zap },
    { label: "Realistic battlefield", icon: Plane },
  ],
  [
    { label: "Fight-first shooter", icon: Crosshair },
    { label: "Jungle expedition drive", icon: Car },
    { label: "Sunny kingdom platformer", icon: Gamepad2 },
  ],
]

export function ChatComposer() {
  const [prompt, setPrompt] = React.useState("")
  const [model, setModel] = React.useState("Kimi K3")
  const [isPending, startTransition] = React.useTransition()

  const handleCreate = (text?: string) => {
    const title = (text ?? prompt).trim()
    if (!title || isPending) return

    startTransition(async () => {
      try {
        await createGame({ title })
        setPrompt("")
      } catch (error) {
        console.error("Failed to create game:", error)
      }
    })
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <InputGroup className="bg-popover">
        <InputGroupTextarea
          className="field-sizing-content max-h-48 min-h-10"
          rows={1}
          placeholder="Describe the game you want to build..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
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
            disabled={!prompt.trim() || isPending}
            onClick={() => handleCreate()}
          >
            <ArrowUp />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      <div className="flex flex-col items-center gap-2">
        {SUGGESTIONS.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {row.map((suggestion) => {
              const Icon = suggestion.icon
              return (
                <Button
                  key={suggestion.label}
                  variant="outline"
                  size="sm"
                  className="rounded-full font-normal text-muted-foreground hover:text-foreground"
                  disabled={isPending}
                  onClick={() => handleCreate(suggestion.label)}
                >
                  <Icon />
                  <span>{suggestion.label}</span>
                </Button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default ChatComposer

