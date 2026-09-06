import {
  Pickaxe,
  Swords,
  Zap,
  Plane,
  Crosshair,
  Car,
  Gamepad2,
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
      label: "Voxel survival",
      prompt:
        "Create a 3D voxel survival gamebox game with procedurally generated terrain, block gathering, tool crafting, and day-night survival cycles.",
      icon: Pickaxe,
    },
    {
      label: "Ink samurai duel",
      prompt:
        "Build a stylized Japanese ink-wash (sumi-e) samurai duel game featuring timed parries, sword clashes, and cinematic martial arts combat.",
      icon: Swords,
    },
    {
      label: "Comic-book firefight",
      prompt:
        "Create a cel-shaded comic-book shooter with popping onomatopoeia visual effects, dynamic cover mechanics, and arcade gunplay.",
      icon: Zap,
    },
    {
      label: "Realistic battlefield",
      prompt:
        "Design a large-scale tactical battlefield game with combined arms, vehicle transport, destructible environments, and squad objectives.",
      icon: Plane,
    },
  ],
  [
    {
      label: "Fight-first shooter",
      prompt:
        "Develop a fast-paced retro arena FPS with high-mobility strafe jumping, power weapons, aggressive enemy waves, and a heavy industrial soundtrack aesthetic.",
      icon: Crosshair,
    },
    {
      label: "Jungle expedition drive",
      prompt:
        "Build an off-road 4x4 jungle expedition driving simulator with muddy physics, winch mechanics, river crossings, and lost ruins exploration.",
      icon: Car,
    },
    {
      label: "Sunny kingdom platformer",
      prompt:
        "Create a vibrant 3D platformer set in a floating fantasy kingdom with double-jumps, collectible star coins, bouncy pads, and moving platforms.",
      icon: Gamepad2,
    },
  ],
]
