import { generateText } from "ai"
import * as Sentry from "@sentry/nextjs"

import { getLanguageModel } from "@/lib/ai/provider"

/**
 * Generates a concise, catchy game title (2 to 5 words) based on the game description.
 */
export async function generateGameTitle(
  promptText: string
): Promise<string | null> {
  const cleanPrompt = promptText.trim()
  if (!cleanPrompt) return null

  try {
    const model = getLanguageModel("google/gemini-2.5-flash")

    const { text } = await generateText({
      model,
      system:
        "You are a creative game title generator. Generate a concise, catchy game title (2 to 5 words) for the provided game description. Output ONLY the title, with no quotes, markdown formatting, or ending punctuation.",
      prompt: `Game description: ${cleanPrompt}`,
    })

    const title = text
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/[.]+$/, "")
      .trim()

    if (title) {
      Sentry.logger.info("Background game title generated", {
        title,
        promptLength: cleanPrompt.length,
      })
    }

    return title || null
  } catch (error) {
    Sentry.logger.error("Background game title generation failed", {
      promptLength: cleanPrompt.length,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
