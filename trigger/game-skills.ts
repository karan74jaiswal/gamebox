import { skills } from "@trigger.dev/sdk"

export type ResolvedSkill = Awaited<
  ReturnType<ReturnType<typeof skills.define>["local"]>
>

export const directorSkill = skills.define({
  id: "threejs-game-director",
  path: "../skills/threejs-game-director",
})

export const gameplaySystemsSkill = skills.define({
  id: "threejs-gameplay-systems",
  path: "../skills/threejs-gameplay-systems",
})

export const aaaGraphicsBuilderSkill = skills.define({
  id: "threejs-aaa-graphics-builder",
  path: "../skills/threejs-aaa-graphics-builder",
})

export const gameUiDesignerSkill = skills.define({
  id: "threejs-game-ui-designer",
  path: "../skills/threejs-game-ui-designer",
})

export const debugProfilerSkill = skills.define({
  id: "threejs-debug-profiler",
  path: "../skills/threejs-debug-profiler",
})

export const qaReleaseSkill = skills.define({
  id: "threejs-qa-release",
  path: "../skills/threejs-qa-release",
})

export const generator3dSkill = skills.define({
  id: "threejs-3d-generator",
  path: "../skills/threejs-3d-generator",
})

export const imageGeneratorSkill = skills.define({
  id: "threejs-image-generator",
  path: "../skills/threejs-image-generator",
})

export const audioGeneratorSkill = skills.define({
  id: "threejs-audio-generator",
  path: "../skills/threejs-audio-generator",
})

export const gameSkillHandles = [
  directorSkill,
  gameplaySystemsSkill,
  aaaGraphicsBuilderSkill,
  gameUiDesignerSkill,
  debugProfilerSkill,
  qaReleaseSkill,
  generator3dSkill,
  imageGeneratorSkill,
  audioGeneratorSkill,
]

let cachedResolvedSkills: ResolvedSkill[] | null = null

/**
 * Resolves all bundled Three.js game development skills.
 * Cached in memory so disk reads only happen once per worker process.
 */
export async function getGameSkills(): Promise<ResolvedSkill[]> {
  if (cachedResolvedSkills) {
    return cachedResolvedSkills
  }
  cachedResolvedSkills = await Promise.all(
    gameSkillHandles.map((handle) => handle.local())
  )
  return cachedResolvedSkills
}
