import { workflowInstructions } from "./workflow"
import { runtimeInstructions } from "./runtime"
import { type Instructions } from "ai"

/**
 * Combined array of game instructions for the Gamebox AI agent.
 */
export const gameInstructions = [
  { role: "system", content: workflowInstructions },
  { role: "system", content: runtimeInstructions },
] satisfies Instructions

/**
 * Alias for gameInstructions.
 */
export const instructions = gameInstructions

export default gameInstructions

export * from "./workflow"
export * from "./runtime"
