import { generateText } from "ai"

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

    return title || null
  } catch (error) {
    console.error("Background game title generation failed:", error)
    return null
  }
}
