"use client"

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
  return (
    <div className="flex w-full flex-col gap-6">
      <InputGroup className="bg-popover">
        <InputGroupTextarea
          className="field-sizing-content max-h-48 min-h-10"
          rows={1}
          placeholder="Describe the game you want to build..."
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <InputGroupButton variant="ghost">
                  <Grip />
                  <span>Kimi K3</span>
                  <ChevronDown />
                </InputGroupButton>
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuItem>Kimi K3</DropdownMenuItem>
              <DropdownMenuItem>Claude 3.7 Sonnet</DropdownMenuItem>
              <DropdownMenuItem>Claude 3.5 Sonnet</DropdownMenuItem>
              <DropdownMenuItem>GPT-4o</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <InputGroupButton
            size="icon-sm"
            variant="default"
            className="rounded-full"
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
