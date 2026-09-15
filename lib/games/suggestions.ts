import {
  Rocket,
  Waves,
  Ghost,
  CircleDot,
  Bot,
  Sparkles,
  Footprints,
  type LucideIcon,
} from "lucide-react"

export interface Suggestion {
  label: string
  prompt: string
  icon: LucideIcon
}

export const SUGGESTIONS: Suggestion[][] = [
  [
    {
      label: "Synthwave drift racer",
      prompt:
        "Build a neon-drenched synthwave hover racer with boost pads, drift mechanics, trailing light ribbons, and a pulsating electronic soundtrack.",
      icon: Rocket,
    },
    {
      label: "Abyssal submarine",
      prompt:
        "Create an atmospheric deep-sea submarine exploration game with sonar navigation, bioluminescent creatures, pressure management, and sunken trench mysteries.",
      icon: Waves,
    },
    {
      label: "Midnight horde survivor",
      prompt:
        "Develop a fast-paced gothic horde survival game with auto-firing arcane spells, thousands of swarming skeletons, and screen-clearing upgrade synergies.",
      icon: Ghost,
    },
    {
      label: "Pinball crawler",
      prompt:
        "Create a physics-driven pinball roguelike where you launch armored heroes through trap-filled dungeons, hit monster bumpers, and trigger combo score multipliers.",
      icon: CircleDot,
    },
  ],
  [
    {
      label: "Orbital mech arena",
      prompt:
        "Design a zero-gravity 3D mech combat simulator with 360-degree thruster vectoring, beam sabers, missile salvos, and floating orbital debris fields.",
      icon: Bot,
    },
    {
      label: "Potion crafting tavern",
      prompt:
        "Build a cozy 3D alchemy shop simulator where you gather magical herbs, stir bubbling cauldrons with realistic fluid physics, and serve mythical patrons.",
      icon: Sparkles,
    },
    {
      label: "Rooftop neon parkour",
      prompt:
        "Create a fluid first-person parkour runner across neon skyscrapers featuring wall-running, grappling lines, slide maneuvers, and momentum-based time dilation.",
      icon: Footprints,
    },
  ],
]
