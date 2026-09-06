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

export default function Page() {
  const [prompt, setPrompt] = React.useState("")

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <Empty className="flex-none">
        <EmptyHeader>
          <EmptyMedia>
            <Image src="/logo.svg" alt="Gamebox" width={48} height={48} />
          </EmptyMedia>
          <EmptyTitle className="text-2xl">
            What should we build today?
          </EmptyTitle>
          <EmptyDescription>
            Build your own racers, shooters, puzzles and whole worlds using your
            own words. If you can describe it, you can play it.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-2xl gap-6">
          <ChatComposer input={prompt} onInputChange={setPrompt} />
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
                      onClick={() => setPrompt(suggestion.prompt)}
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
