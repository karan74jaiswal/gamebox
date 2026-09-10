"use client"

import * as React from "react"

import { type UIMessage } from "ai"
import {
  CheckCircle2,
  Gamepad2,
  Globe,
  HelpCircle,
  Loader2,
  Sliders,
  Sparkles,
  Swords,
  Target,
  Zap,
} from "lucide-react"

import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire"
import { Badge } from "@/components/ui/badge"

import { cn } from "@/lib/utils"

export interface AskPlayerInput {
  dimension?: string
  question?: string
  options?: Array<{
    id: string
    label: string
    description?: string
  }>
}

export interface AskPlayerOutput {
  id?: string
  label?: string
}

export const DIMENSION_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  loop: { label: "Gameplay Loop", icon: Gamepad2 },
  goal: { label: "Goal & Progression", icon: Target },
  world: { label: "World & Theme", icon: Globe },
  look: { label: "Visual Style", icon: Sparkles },
  feel: { label: "Game Feel & Audio", icon: Zap },
  challenge: { label: "Challenge & Enemies", icon: Swords },
  controls: { label: "Controls & Input", icon: Sliders },
}

export interface AskPlayerQuestionnaireProps {
  part: Extract<UIMessage["parts"][number], { toolCallId: string }>
  onAnswer: (output: { id: string; label: string }) => void
}

export function AskPlayerQuestionnaire({
  part,
  onAnswer,
}: AskPlayerQuestionnaireProps) {
  const rawInput = part.input
  let input: AskPlayerInput = {}
  if (typeof rawInput === "string") {
    try {
      input = JSON.parse(rawInput)
    } catch {
      input = {}
    }
  } else if (typeof rawInput === "object" && rawInput !== null) {
    input = rawInput as AskPlayerInput
  }

  const rawOutput = "output" in part ? part.output : undefined
  let output: AskPlayerOutput | undefined = undefined
  if (typeof rawOutput === "string") {
    try {
      output = JSON.parse(rawOutput)
    } catch {
      output = undefined
    }
  } else if (typeof rawOutput === "object" && rawOutput !== null) {
    output = rawOutput as AskPlayerOutput
  }

  const isAnswered = Boolean(part.state === "output-available" || output?.id)
  const answeredId = output?.id
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const effectiveSelectedId = answeredId ?? selectedId

  const isLoadingInput =
    part.state === "input-streaming" ||
    !input.question ||
    !Array.isArray(input.options) ||
    input.options.length === 0

  const dimensionKey = input.dimension?.toLowerCase() ?? ""
  const dimensionConfig = DIMENSION_CONFIG[dimensionKey] || {
    label: input.dimension ? input.dimension.toUpperCase() : "Game Decision",
    icon: HelpCircle,
  }
  const DimensionIcon = dimensionConfig.icon

  if (isLoadingInput) {
    return (
      <div className="my-2 flex w-full max-w-xl items-center gap-3 rounded-xl border border-border/70 bg-card/60 p-4 text-muted-foreground backdrop-blur-xs">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="text-sm">Preparing question for player...</span>
      </div>
    )
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isAnswered || isSubmitting) return

    const targetId = effectiveSelectedId
    if (!targetId) return

    const chosenOption = input.options?.find((opt) => opt.id === targetId)
    if (!chosenOption) return

    setIsSubmitting(true)
    onAnswer({
      id: chosenOption.id,
      label: chosenOption.label,
    })
  }

  return (
    <div className="my-2 flex w-full max-w-xl flex-col gap-3 rounded-xl border border-border/80 bg-card/60 p-4 shadow-xs backdrop-blur-xs transition-all">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1.5 py-0.5 text-xs font-medium"
          >
            <DimensionIcon className="size-3 text-primary" />
            {dimensionConfig.label}
          </Badge>
        </div>
        {isAnswered ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            <span>Answered: {output?.label || effectiveSelectedId}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <span>Player input needed</span>
          </div>
        )}
      </div>

      <Questionnaire
        shortcuts="letters"
        onSubmit={handleSubmit}
        className="gap-3"
      >
        <QuestionnaireItem
          name="player_decision"
          required
          disabled={isAnswered || isSubmitting}
        >
          <QuestionnaireTitle className="text-sm leading-snug font-semibold text-foreground">
            {input.question}
          </QuestionnaireTitle>

          {input.options && (
            <QuestionnaireChoices className="grid gap-2">
              {input.options.map((option) => {
                const isSelected = effectiveSelectedId === option.id
                const isChosen = isAnswered && output?.id === option.id

                return (
                  <QuestionnaireChoice
                    key={option.id}
                    value={option.id}
                    checked={isAnswered ? isChosen : isSelected}
                    disabled={isAnswered || isSubmitting}
                    onChange={(e) => {
                      if (!isAnswered && e.target.checked) {
                        setSelectedId(option.id)
                      }
                    }}
                    className={cn(
                      "transition-all",
                      isAnswered &&
                        !isChosen &&
                        "cursor-default border-border/40 opacity-40 hover:bg-transparent",
                      isAnswered &&
                        isChosen &&
                        "cursor-default border-emerald-500/50 bg-emerald-500/10 dark:border-emerald-500/40 dark:bg-emerald-500/15",
                      !isAnswered && isSelected && "border-primary/60 bg-muted"
                    )}
                  >
                    <span className="font-medium text-foreground">
                      {option.label}
                    </span>
                    {option.description && (
                      <QuestionnaireChoiceDescription>
                        {option.description}
                      </QuestionnaireChoiceDescription>
                    )}
                  </QuestionnaireChoice>
                )
              })}
            </QuestionnaireChoices>
          )}

          {!isAnswered && (
            <QuestionnaireActions className="mt-1 flex items-center justify-end">
              <QuestionnaireSubmit
                disabled={!effectiveSelectedId || isSubmitting}
                size="sm"
                className="cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Confirm Choice"
                )}
              </QuestionnaireSubmit>
            </QuestionnaireActions>
          )}
        </QuestionnaireItem>
      </Questionnaire>
    </div>
  )
}

export default AskPlayerQuestionnaire
