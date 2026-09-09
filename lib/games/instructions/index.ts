import { engineInstructions } from "./engine"
import { runtimeInstructions } from "./runtime"
import { workflowInstructions } from "./workflow"
import { type Instructions } from "ai"

/**
 * Combined array of game instructions for the Gamebox AI agent.
 * Combines 3 distinct concern areas:
 * 1. engine.ts   - Complete Gamebox 3D Engine & Primitives API reference
 * 2. runtime.ts  - Daytona Sandbox, HTTP server, and iframe environment
 * 3. workflow.ts - AI agent development rules, tool usage, and incremental progress
 */
export const gameInstructions = [
  { role: "system", content: engineInstructions },
  { role: "system", content: runtimeInstructions },
  { role: "system", content: workflowInstructions },
] satisfies Instructions

/**
 * Alias for gameInstructions.
 */
export const instructions = gameInstructions

export default gameInstructions

export * from "./engine"
export * from "./runtime"
export * from "./workflow"
