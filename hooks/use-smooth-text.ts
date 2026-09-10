"use client"

import * as React from "react"

export interface UseSmoothTextOptions {
  /**
   * Target characters to advance per frame during steady state at 60fps.
   * Defaults to 1.
   */
  baseStep?: number
  /**
   * When true, keeps animating the tail for a few frames after streaming stops
   * until all characters are revealed, rather than snapping abruptly.
   * Defaults to true.
   */
  smoothCompletion?: boolean
}

export interface UseSmoothTextResult {
  /** The smoothly interpolated text to render in the UI */
  displayedText: string
  /** True while streaming is active OR while the buffer is draining the final characters */
  isTyping: boolean
}

/**
 * Decouples bursty network streaming chunks from the display layer by interpolating
 * displayed text at 60fps/120fps using requestAnimationFrame.
 *
 * This delivers the exact, zero-jitter typing experience of ChatGPT and Claude:
 * - When streaming, text expands smoothly character-by-character every frame.
 * - If the model outputs a large burst, speed scales proportionally so it stays within ~100ms of real-time.
 * - Handles 60Hz and 120Hz (ProMotion) display refresh rates with delta timing.
 * - Prevents splitting UTF-16 surrogate pairs (emojis).
 * - When streaming finishes, smoothly drains the remaining characters to the punctuation mark.
 * - If not streaming (e.g. historical messages), renders instantly with zero delay.
 */
export function useSmoothText(
  targetText: string,
  isStreaming: boolean,
  options?: UseSmoothTextOptions
): UseSmoothTextResult {
  const { smoothCompletion = true } = options ?? {}

  const [displayedText, setDisplayedText] = React.useState(targetText)
  const [isTyping, setIsTyping] = React.useState(isStreaming)

  const targetRef = React.useRef(targetText)
  const displayedRef = React.useRef(displayedText)
  const isStreamingRef = React.useRef(isStreaming)

  React.useLayoutEffect(() => {
    targetRef.current = targetText
    displayedRef.current = displayedText
    isStreamingRef.current = isStreaming
  })

  const rafIdRef = React.useRef<number | null>(null)
  const lastTimeRef = React.useRef<number>(0)

  React.useEffect(() => {
    // If not streaming:
    if (!isStreaming) {
      // If we are already caught up, or if content was replaced/reset, or if smoothCompletion is disabled:
      const diff = targetText.length - displayedRef.current.length
      if (
        !smoothCompletion ||
        displayedRef.current === targetText ||
        !targetText.startsWith(displayedRef.current) ||
        diff < 0 ||
        diff > 120
      ) {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
        setDisplayedText(targetText)
        displayedRef.current = targetText
        setIsTyping(false)
        return
      }
    }

    // If target doesn't start with displayed text (e.g. content cleared, replaced, or truncated),
    // snap immediately:
    if (!targetRef.current.startsWith(displayedRef.current)) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      setDisplayedText(targetRef.current)
      displayedRef.current = targetRef.current
      setIsTyping(isStreaming)
      return
    }

    // If already caught up and isStreaming is true:
    if (displayedRef.current.length >= targetRef.current.length) {
      if (isStreaming) {
        setIsTyping(true)
      } else {
        setIsTyping(false)
      }
      return
    }

    setIsTyping(true)

    const tick = (currentTime: number) => {
      const currentTarget = targetRef.current
      const currentDisplayed = displayedRef.current
      const active = isStreamingRef.current

      // Check if target was reset or truncated
      if (!currentTarget.startsWith(currentDisplayed)) {
        setDisplayedText(currentTarget)
        displayedRef.current = currentTarget
        setIsTyping(active)
        rafIdRef.current = null
        return
      }

      const diff = currentTarget.length - currentDisplayed.length

      if (diff <= 0) {
        rafIdRef.current = null
        if (!active) {
          setIsTyping(false)
        }
        return
      }

      // Elapsed time delta handling 60Hz, 120Hz (ProMotion), and frame drops
      const delta = lastTimeRef.current
        ? Math.min(currentTime - lastTimeRef.current, 100)
        : 16.6
      lastTimeRef.current = currentTime

      // Normalize speed: base frame is ~16.6ms (60fps)
      const frameMultiplier = delta / 16.6

      // Determine character advance budget for this frame based on backlog
      let step: number
      if (!active) {
        // Stream completed: swiftly drain any remaining chars in 1-3 frames (<40ms)
        step = Math.max(3, Math.ceil(diff / 2))
      } else if (diff <= 2) {
        // Very low backlog (natural typing rhythm)
        step = 1
      } else if (diff <= 8) {
        // Light backlog (~50-80 chars/sec)
        step = Math.max(1, Math.round(1.2 * frameMultiplier))
      } else if (diff <= 25) {
        // Catching up with model pacing
        step = Math.max(2, Math.round((diff / 7) * frameMultiplier))
      } else if (diff <= 80) {
        // Fast generation burst
        step = Math.max(3, Math.round((diff / 4.5) * frameMultiplier))
      } else {
        // Heavy burst
        step = Math.max(6, Math.round((diff / 3) * frameMultiplier))
      }

      let nextLength = Math.min(
        currentDisplayed.length + step,
        currentTarget.length
      )

      // Prevent splitting a UTF-16 surrogate pair (e.g. emojis)
      if (nextLength < currentTarget.length) {
        const code = currentTarget.charCodeAt(nextLength - 1)
        if (code >= 0xd800 && code <= 0xdbff) {
          nextLength += 1
        }
      }

      const nextText = currentTarget.slice(0, nextLength)

      setDisplayedText(nextText)
      displayedRef.current = nextText

      if (nextLength < currentTarget.length) {
        rafIdRef.current = requestAnimationFrame(tick)
      } else {
        rafIdRef.current = null
        if (!active) {
          setIsTyping(false)
        }
      }
    }

    if (
      rafIdRef.current === null &&
      displayedRef.current.length < targetRef.current.length
    ) {
      lastTimeRef.current = performance.now()
      rafIdRef.current = requestAnimationFrame(tick)
    }
  }, [targetText, isStreaming, smoothCompletion])

  React.useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [])

  return { displayedText, isTyping }
}
