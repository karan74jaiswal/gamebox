"use client"

import * as React from "react"

export interface UseChatCreditsOptions {
  initialIsOutOfCredits?: boolean
}

export function useChatCredits({
  initialIsOutOfCredits = false,
}: UseChatCreditsOptions = {}) {
  const [prevInitial, setPrevInitial] = React.useState(initialIsOutOfCredits)
  const [isOutOfCredits, setIsOutOfCredits] = React.useState(
    Boolean(initialIsOutOfCredits)
  )

  // Adjust state during render when prop changes (avoids cascading render in useEffect)
  if (initialIsOutOfCredits !== prevInitial) {
    setPrevInitial(initialIsOutOfCredits)
    setIsOutOfCredits(Boolean(initialIsOutOfCredits))
  }

  React.useEffect(() => {
    const handleCreditsUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ credits?: string }>).detail
      if (detail?.credits) {
        const numericValue = parseFloat(detail.credits.replace(/[^0-9.-]/g, ""))
        if (!isNaN(numericValue) && numericValue > 0) {
          setIsOutOfCredits(false)
        }
      }
    }
    window.addEventListener("credits-updated", handleCreditsUpdate)
    return () => {
      window.removeEventListener("credits-updated", handleCreditsUpdate)
    }
  }, [])

  return {
    isOutOfCredits,
    setIsOutOfCredits,
  }
}
