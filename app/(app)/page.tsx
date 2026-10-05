"use client"

import * as React from "react"
import Image from "next/image"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { ChatComposer } from "@/components/chat-composer"
import { SUGGESTIONS } from "@/lib/games/suggestions"
import { cn } from "@/lib/utils"

export default function Page() {
  const [prompt, setPrompt] = React.useState("")
  const [isCreating, setIsCreating] = React.useState(false)

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <Empty
        className={cn(
          "flex-none transition-all duration-300",
          isCreating && "scale-[0.99]"
        )}
      >
        <EmptyHeader
          className={cn(
            "transition-opacity duration-300",
            isCreating && "opacity-70"
          )}
        >
          <EmptyMedia>
            <Image
              src="/logo.svg"
              alt="Gamebox"
              width={48}
              height={48}
              className={cn(
                "transition-transform duration-500",
                isCreating && "scale-110 animate-pulse"
              )}
            />
          </EmptyMedia>
          <EmptyTitle className="text-2xl">
            {isCreating ? "Preparing your game arena..." : "What should we build today?"}
          </EmptyTitle>
          <EmptyDescription>
            {isCreating
              ? "Allocating game workspace and preparing Three.js engine..."
              : "Build your own racers, shooters, puzzles and whole worlds using your own words. If you can describe it, you can play it."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-2xl gap-6">
          <ChatComposer
            input={prompt}
            onInputChange={setPrompt}
            onCreatingChange={setIsCreating}
          />
          <div
            className={cn(
              "flex flex-col items-center gap-2 transition-all duration-300",
              isCreating && "opacity-30 pointer-events-none"
            )}
          >
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
                      onClick={() => setPrompt(suggestion.prompt)}
                      disabled={isCreating}
                    >
                      <Icon />
                      <span>{suggestion.label}</span>
                    </Button>
                  )
                })}
              </div>
            ))}
          </div>
        </EmptyContent>
      </Empty>
    </div>
  )
}
