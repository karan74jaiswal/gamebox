import {
  write_file,
  update_file,
  replace_text,
  read_file,
  inspect_symbols,
  verify_game,
  list_files,
  delete_file,
  ask_player,
  generate_texture,
  generate_music,
} from "@/lib/games/tools"

import { ARCHITECT_SYSTEM_PROMPT } from "./architect"
import { ARTIST_SYSTEM_PROMPT } from "./artist"
import { ENGINEER_SYSTEM_PROMPT } from "./engineer"

export { ARCHITECT_SYSTEM_PROMPT, ARTIST_SYSTEM_PROMPT, ENGINEER_SYSTEM_PROMPT }

/**
 * Dedicated toolset for Agent 1: Game Director & Architect
 * Minimal footprint: only file reading and writing the plan.
 */
export const architectTools = {
  write_file,
  read_file,
  list_files,
}

/**
 * Dedicated toolset for Agent 2: Art Director & Asset Specialist
 * Focused strictly on asset synthesis and updating the asset manifest.
 */
export const artistTools = {
  generate_texture,
  generate_music,
  read_file,
  write_file,
  list_files,
}

/**
 * Dedicated toolset for Agent 3: Lead Gameplay & Three.js Engineer
 * Full development suite for coding, editing, symbol lookup, and verification.
 */
export const engineerTools = {
  write_file,
  update_file,
  replace_text,
  read_file,
  inspect_symbols,
  verify_game,
  list_files,
  delete_file,
  ask_player,
  generate_texture,
  generate_music,
}
