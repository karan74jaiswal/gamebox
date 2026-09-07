import { gateway, generateText } from "ai"
import { google } from "@ai-sdk/google"

/**
 * Generates a concise, catchy game title (2 to 5 words) based on the game description.
 */
export async function generateGameTitle(
  promptText: string
): Promise<string | null> {
  const cleanPrompt = promptText.trim()
  if (!cleanPrompt) return null

  try {
    const hasGatewayKey = Boolean(process.env.AI_GATEWAY_API_KEY)
    const hasGoogleKey = Boolean(
      process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY
    )

    if (!hasGatewayKey && !hasGoogleKey) {
      return null
    }

    const model = hasGatewayKey
      ? gateway("google/gemini-2.5-flash")
      : google("gemini-2.5-flash")

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
