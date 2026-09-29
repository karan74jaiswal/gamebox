/**
 * Curated high-fidelity public 3D assets, animations, audio, and skyboxes.
 * 
 * Sourced from open-source MIT-licensed mint-playground experiences.
 * Delivered via Cloudflare CDN (immutable caching, zero tokens or auth needed).
 */

export const ASSET_CDN_BASE = "https://cdn.mint.gg"
export const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/"

export const ASSET_CATALOG = {
  superhero: {
    hero: `${ASSET_CDN_BASE}/glb/pointed-ear-tactical-bat-normalized-ff2366856f241cc2.glb`,
    blimp: `${ASSET_CDN_BASE}/glb/gunmetal-sentinel-blimp-normalized-6768a5df6c37d186.glb`,
    signalTower: `${ASSET_CDN_BASE}/glb/gargoyle-sentinel-spire-normalized-e632b95bf75ed478.glb`,
    skybox: `${ASSET_CDN_BASE}/images/xn73bbk8ny2yx9ydfwhk5j5r618bvbfc/knightfall-storm-sky-10ce49-4bd1588c2f68167a.png`,
    animations: {
      diveLand: `${ASSET_CDN_BASE}/glb/action-506-glb-2ddd037853eb9023.glb`,
      crouch: `${ASSET_CDN_BASE}/glb/action-258-glb-c929f0e00d047389.glb`,
      falling: `${ASSET_CDN_BASE}/glb/action-366-glb-5041bdfb8541b373.glb`,
    },
    city: {
      spire: `${ASSET_CDN_BASE}/glb/deco-tower-spire-normalized-37a1760d7d029ad1.glb`,
      slab: `${ASSET_CDN_BASE}/glb/deco-tower-slab-normalized-6b10e88acb1d8b5e.glb`,
      twin: `${ASSET_CDN_BASE}/glb/deco-tower-twin-normalized-2715895f3986258a.glb`,
      neonBlock: `${ASSET_CDN_BASE}/glb/deco-block-neon-normalized-1da7ee2a0e102918.glb`,
      industrial: `${ASSET_CDN_BASE}/glb/deco-tower-industrial-normalized-438419a1340d3f8d.glb`,
      bridge: `${ASSET_CDN_BASE}/glb/gotham-bridge-normalized-b0ae1b21c9003746.glb`,
      ferrisWheel: `${ASSET_CDN_BASE}/glb/gotham-ferris-wheel-normalized-668fe8b1b1984a4e.glb`,
    },
  },
  fantasy: {
    creatures: {
      thornheartBoss: `${ASSET_CDN_BASE}/glb/thornheart-fa98e25e470c7486.glb`,
      barkKnight: `${ASSET_CDN_BASE}/glb/bark-knight-d3186109b9bc55c3.glb`,
      rotToad: `${ASSET_CDN_BASE}/glb/rot-toad-582373fff48399bc.glb`,
      stonehorn: `${ASSET_CDN_BASE}/glb/stonehorn-c3848fb05eb4f9bd.glb`,
      sproutling: `${ASSET_CDN_BASE}/glb/sproutling-f142051a8cbd0cc1.glb`,
      sporecap: `${ASSET_CDN_BASE}/glb/sporecap-d7b2ff9adc215b57.glb`,
      brambleback: `${ASSET_CDN_BASE}/glb/brambleback-b5da811f14cf4790.glb`,
      rootlurker: `${ASSET_CDN_BASE}/glb/rootlurker-6cea63885fe9eb62.glb`,
      moonhare: `${ASSET_CDN_BASE}/glb/moonhare-7e9adaca3e48b92d.glb`,
    },
    weapons: {
      sword: `${ASSET_CDN_BASE}/glb/rune-iron-sword-96f04d14511a9266.glb`,
      swordHand: `${ASSET_CDN_BASE}/glb/blue-cuff-gauntlet-grip-normalized-a0cd446d408bbaa6.glb`,
      shield: `${ASSET_CDN_BASE}/glb/thornwood-buckler-ad7a05485dde6517.glb`,
    },
    ruins: {
      tallMonolith: `${ASSET_CDN_BASE}/glb/tall-rune-monolith-7c5837439df881b2.glb`,
      brokenMonolith: `${ASSET_CDN_BASE}/glb/broken-rune-monolith-481f1613f7f4d903.glb`,
      mossyArchway: `${ASSET_CDN_BASE}/glb/mossy-stone-archway-2ac72a325fcec348.glb`,
      squarePillar: `${ASSET_CDN_BASE}/glb/intact-square-pillar-c45e3b288b690c5d.glb`,
      brokenPillar: `${ASSET_CDN_BASE}/glb/broken-pillar-stump-7c5f3e87cf97a5f7.glb`,
      ruinedWall: `${ASSET_CDN_BASE}/glb/low-ruined-wall-c85cd4c4e51f861c.glb`,
      stairs: `${ASSET_CDN_BASE}/glb/stone-stair-flight-534e8f3ae6ed2d0e.glb`,
      shrineBasin: `${ASSET_CDN_BASE}/glb/moonwell-shrine-basin-c0ab8d21e31e198d.glb`,
      ancientChest: `${ASSET_CDN_BASE}/glb/ancient-reward-chest-4889f849d3d04ebc.glb`,
      brazier: `${ASSET_CDN_BASE}/glb/rune-brazier-04f9a5d36cea53d2.glb`,
      altar: `${ASSET_CDN_BASE}/glb/thornheart-arena-altar-5fa0065e2b763977.glb`,
    },
    nature: {
      broadOak: `${ASSET_CDN_BASE}/glb/ancient-broad-oak-37c76aaab9e1e562.glb`,
      twistedTree: `${ASSET_CDN_BASE}/glb/twisted-root-tree-39b858e3ae821fcd.glb`,
      birchCluster: `${ASSET_CDN_BASE}/glb/young-birch-cluster-52079d68b25c92ab.glb`,
      fallenLog: `${ASSET_CDN_BASE}/glb/fallen-mossy-log-f9156a0a4c99f526.glb`,
      berryBush: `${ASSET_CDN_BASE}/glb/red-berry-bush-bcba4db8caf328ba.glb`,
      flowerBush: `${ASSET_CDN_BASE}/glb/blue-flower-bush-474a67ce200727e1.glb`,
      fern: `${ASSET_CDN_BASE}/glb/fern-clump-1a732038714e6036.glb`,
      mushrooms: `${ASSET_CDN_BASE}/glb/purple-mushroom-cluster-0f22ad56405f6a0a.glb`,
    },
    audio: {
      swordSlashLight: `${ASSET_CDN_BASE}/audio/xd7aqevmtkza3jcc0w473n0cnh8akr65/mossbound-sword-slash-light-7787d2-8a90798bde95988d.mp3`,
      swordSlashHeavy: `${ASSET_CDN_BASE}/audio/xd75tq84h4fztmc0v9ha9tfsax8ajzsp/mossbound-sword-slash-heavy-add62d-fafface85aca27be.mp3`,
      creatureImpact: `${ASSET_CDN_BASE}/audio/xd7146j6z7ttm0jg46h7555zf18ak3hm/mossbound-creature-sword-impact-6ef37f-315a1849c274922d.mp3`,
      stoneImpact: `${ASSET_CDN_BASE}/audio/xd7d27wtqntvf481sey9yk4hjx8akmda/mossbound-stone-shield-impact-78e5e9-f60fcdc3c458f668.mp3`,
      enemyAlert: `${ASSET_CDN_BASE}/audio/xd7e41fbgc8fqm18yynbzma1b58ajnfp/mossbound-enemy-alert-a45066-e48f1827a8d0dea8.mp3`,
      enemyHurt: `${ASSET_CDN_BASE}/audio/xd7ct69f66xd0gq8mxn7ytwhwx8ak7yz/mossbound-enemy-hurt-d6c81b-6389140c6355aa40.mp3`,
      playerDamage: `${ASSET_CDN_BASE}/audio/xd70w4s9csthgez9h0atq148ms8ak3f4/mossbound-player-damage-013e33-a49e16ba420ab0b5.mp3`,
      coinPickup: `${ASSET_CDN_BASE}/audio/xd7b64pfmypm9a97qhke6brgds8akr3t/mossbound-sap-coin-pickup-9f468e-9b3309dd680fa0ac.mp3`,
      levelUp: `${ASSET_CDN_BASE}/audio/xd7f7svdxht9mr8g8ymgr3g0wh8akmh1/mossbound-level-up-24034a-63ed592a50a458e8.mp3`,
      forestLoop: `${ASSET_CDN_BASE}/audio/xd70nrnw4vy0jbt3nqympjez0n8ak6c2/mossbound-enchanted-forest-loop-d5974a-b106607b9580353c.mp3`,
      bossLoop: `${ASSET_CDN_BASE}/audio/xd7abhx0e1r4m6xzjvnqays1c18ajd3z/mossbound-thornheart-battle-loop-ea799b-522e1ea641737631.mp3`,
    },
  },
  scifi: {
    weapons: {
      ionbreaker: `${ASSET_CDN_BASE}/glb/ionbreaker-service-caster-normalized-bd6dea3e1d03be89.glb`,
      arcwelder: `${ASSET_CDN_BASE}/glb/arcwelder-coil-caster-normalized-840e47203f966caf.glb`,
      slagthrower: `${ASSET_CDN_BASE}/glb/slagthrower-heavy-caster-normalized-750d681720e336f8.glb`,
      longcoil: `${ASSET_CDN_BASE}/glb/longcoil-precision-caster-normalized-78f67549810bf2ea.glb`,
      boilover: `${ASSET_CDN_BASE}/glb/boilover-dispersion-caster-normalized-8823ac022427f3bd.glb`,
      pedestal: `${ASSET_CDN_BASE}/glb/tactical-armored-display-pedestal-normalized-6de8699b28dad575.glb`,
    },
    attachments: {
      holoOptic: `${ASSET_CDN_BASE}/glb/holo-optic-module-normalized-f9e452e56c723c56.glb`,
      emitterTube: `${ASSET_CDN_BASE}/glb/emitter-tube-extension-normalized-f12857f8170e3f64.glb`,
      energyCell: `${ASSET_CDN_BASE}/glb/energy-cell-canister-normalized-2a9c1a0a8755d216.glb`,
      angledGrip: `${ASSET_CDN_BASE}/glb/angled-handle-module-normalized-49906bbe242adc6f.glb`,
      stabilizer: `${ASSET_CDN_BASE}/glb/stabilizer-rest-module-normalized-7bd42977e19b1332.glb`,
    },
    audio: {
      ionbreakerLaser: `${ASSET_CDN_BASE}/audio/xd78fbq35rwzgx0h1r6j0aej298c94e5/ionbreaker-laser-4c67ec-ceb0785fe11dc320.mp3`,
      arcwelderLaser: `${ASSET_CDN_BASE}/audio/xd790y9m9bh1jyrn51n5ay2cch8c8vpq/arcwelder-laser-bffe0b-9abe25b0202bb81a.mp3`,
      slagthrowerLaser: `${ASSET_CDN_BASE}/audio/xd74k4jfmxbzy1m7cfr13t0vp98c86gz/slagthrower-laser-ff4a09-d8e025fee3143f7c.mp3`,
      longcoilLaser: `${ASSET_CDN_BASE}/audio/xd78v9m6bgsnbp5jx0c4s4n07s8c8c13/longcoil-laser-13edd5-0e16f31ccc24778b.mp3`,
      boiloverLaser: `${ASSET_CDN_BASE}/audio/xd7edq7vkfptrv33pt5svr33hn8c9ez6/boilover-laser-937940-67f5c6596ff5e6ac.mp3`,
    },
  },
  arcade: {
    basketballHoop: `${ASSET_CDN_BASE}/glb/mint-monogram-hoop-normalized-c2f298a502b7cbcc.glb`,
    boats: {
      runabout: `${ASSET_CDN_BASE}/glb/boat-red-runabout-normalized-5855b55f0c81e000.glb`,
      skiff: `${ASSET_CDN_BASE}/glb/boat-teal-skiff-normalized-a12d1fb49a041a5a.glb`,
      utility: `${ASSET_CDN_BASE}/glb/boat-yellow-utility-normalized-3b21401eb04d6037.glb`,
      dockStraight: `${ASSET_CDN_BASE}/glb/dock-straight-normalized-55550e2ea01d6257.glb`,
      dockCorner: `${ASSET_CDN_BASE}/glb/dock-corner-l-normalized-102ba734afc3deeb.glb`,
      buoy: `${ASSET_CDN_BASE}/glb/buoy-striped-normalized-5963d97f5599870c.glb`,
      boathouse: `${ASSET_CDN_BASE}/glb/marina-boathouse-normalized-7bb594c4a01881d6.glb`,
    },
    birdFlapper: {
      yellow: `${ASSET_CDN_BASE}/glb/round-beak-flapper-normalized-8448019be0704111.glb`,
      red: `${ASSET_CDN_BASE}/glb/scarlet-scowl-bird-normalized-62aa842f26ec616e.glb`,
      robo: `${ASSET_CDN_BASE}/glb/cyan-visor-sentinel-normalized-34e0b91971a793cb.glb`,
      pipe: `${ASSET_CDN_BASE}/glb/glossy-green-warp-pipe-normalized-4b20c5a00336026f.glb`,
      cloud: `${ASSET_CDN_BASE}/glb/pixel-puff-cloud-normalized-12021a5a316ac06f.glb`,
    },
    audio: {
      flap: `${ASSET_CDN_BASE}/audio/xd72x7meygxy5shcfghhrddsxs8bgncc/sfx-flap-2fef3e-05fa80cfa11b37ee.mp3`,
      point: `${ASSET_CDN_BASE}/audio/xd74qb2as6jqhqcr2fy2h18fg18bga5g/sfx-point-58ee4f-6c4653e3706b931c.mp3`,
      hit: `${ASSET_CDN_BASE}/audio/xd73rjfs3r9dqerm6wv0vqg38x8bgesh/sfx-hit-3a4a2b-b7ad4819bb103ff0.mp3`,
      boatEngine: `${ASSET_CDN_BASE}/audio/xd766pqhhpbb82zfnsqhswc9gs8bxzr4/boat-engine-cbeae2-2fc1f764b43704ec.mp3`,
      waterMove: `${ASSET_CDN_BASE}/audio/xd7f6980fnb0srge2ar61hb7y98bwvmf/water-move-d2d95c-9f32ff894930cbac.mp3`,
      dockHit: `${ASSET_CDN_BASE}/audio/xd76z6cs9yc39jgsnxfz078hvn8bxvwr/dock-hit-db920d-1f30196681a7abbc.mp3`,
      chimeSuccess: `${ASSET_CDN_BASE}/audio/xd7cz9c2dp8ajrs4hpayt5w7258bwa22/success-chime-63f233-d56748d6b30c416e.mp3`,
    },
  },
} as const;

export type AssetCatalog = typeof ASSET_CATALOG;

import masterCatalogJson from "./master-catalog.json"

export interface MasterAssetEntry {
  cat: "props" | "weapons" | "audio" | "textures" | "vehicles" | "environment" | "animation" | "characters"
  exp: string
  file: string
  url: string
  size: number
}

export const MASTER_ASSETS: Record<string, MasterAssetEntry> = masterCatalogJson as Record<string, MasterAssetEntry>

export interface AssetPackInfo {
  id: string
  name: string
  theme: string
  tags: string[]
  sampleKey?: string
}

export const ASSET_PACKS: Record<string, AssetPackInfo> = {
  knightfall: {
    id: "knightfall",
    name: "Gothic City & Hero Flight",
    theme:
      "City skyscrapers, tactical hero suit, blimp, gargoyle spires, flight animations",
    tags: [
      "city",
      "skyscrapers",
      "hero",
      "batman",
      "flight",
      "vigilante",
      "blimp",
      "aerial",
      "cape",
    ],
    sampleKey: "knightfall:batman",
  },
  mossbound: {
    id: "mossbound",
    name: "Dark Fantasy & Melee Ruins",
    theme:
      "Rune swords, ancient trees, boss golems, creature monsters, stone ruins",
    tags: [
      "fantasy",
      "sword",
      "knight",
      "boss",
      "creature",
      "monster",
      "ruins",
      "forest",
      "rpg",
      "melee",
    ],
    sampleKey: "mossbound:thornheart",
  },
  "battle-blaster": {
    id: "battle-blaster",
    name: "Sci-Fi Plasma Weapons",
    theme:
      "5 modular plasma casters, laser audio, energy cells, holographic optics",
    tags: [
      "weapon",
      "laser",
      "gun",
      "plasma",
      "caster",
      "scifi",
      "shooter",
      "fps",
      "blaster",
    ],
    sampleKey: "battle-blaster:plasma-weapons:asset_pack_item_glb:vd7fm7jh9n4pdmfxcqf3jxeps98c808x:0:ks73qytpfc8th8qk8s4k9v4h4h8c9ecw",
  },
  "blacksite-echo": {
    id: "blacksite-echo",
    name: "Tactical Military Compound",
    theme:
      "Military structures, crates, radar, firearms, ammunition, tactical compound",
    tags: ["military", "compound", "base", "tactical", "crates", "guns", "fps"],
  },
  "solvane-vela": {
    id: "solvane-vela",
    name: "Vehicles & Sports Cars",
    theme: "Black touring cars, candy red convertibles, sports automobiles",
    tags: [
      "vehicle",
      "car",
      "convertible",
      "racing",
      "driving",
      "automobile",
      "sports car",
    ],
  },
  "perfect-parking-3d": {
    id: "perfect-parking-3d",
    name: "Urban Parking & Sedans",
    theme: "City cars, parking lots, urban obstacles, traffic cones",
    tags: ["car", "vehicle", "parking", "driving", "urban"],
  },
  "financial-city": {
    id: "financial-city",
    name: "Modern Urban High-Rises",
    theme:
      "Modern commercial skyscrapers, office towers, city streets, asphalt",
    tags: ["city", "skyscraper", "building", "urban", "street", "modern"],
  },
  "the-mars-trail": {
    id: "the-mars-trail",
    name: "Mars Planetary Exploration",
    theme: "Mars rovers, red planet terrain, astronauts, alien landscape",
    tags: [
      "space",
      "mars",
      "rover",
      "planet",
      "astronaut",
      "exploration",
      "scifi",
    ],
  },
  "orbit-week": {
    id: "orbit-week",
    name: "Deep Space & Orbit",
    theme:
      "Deep space skyboxes, orbital satellites, galaxy backgrounds, zero-g audio",
    tags: ["space", "orbit", "skybox", "galaxy", "stars", "satellites"],
  },
  "reef-rivals": {
    id: "reef-rivals",
    name: "Island Combat & Pirate Rafts",
    theme:
      "Pirate rafts, cannons, barrels, tropical islands, palm trees, ocean combat",
    tags: [
      "pirate",
      "boat",
      "raft",
      "island",
      "cannon",
      "ocean",
      "water",
      "tropical",
    ],
  },
  "tiny-boat-docking": {
    id: "tiny-boat-docking",
    name: "Marina & Speedboats",
    theme:
      "Red runabout speedboats, teal skiffs, docks, buoys, boathouses, water audio",
    tags: ["boat", "water", "speedboat", "dock", "buoy", "marina", "sailing"],
  },
  "splat-playground": {
    id: "splat-playground",
    name: "Cartoon Arcade & Plumber Hero",
    theme: "Red cap plumber hero, optic sentinels, cartoon platforms, pipes",
    tags: [
      "cartoon",
      "arcade",
      "mario",
      "plumber",
      "platformer",
      "character",
      "retro",
    ],
  },
  "flappy-bird-3d": {
    id: "flappy-bird-3d",
    name: "Retro Flapper & Pipes",
    theme:
      "Glossy green warp pipes, flapper birds, pixel puff clouds, point SFX",
    tags: ["arcade", "pipe", "bird", "cloud", "flapper", "runner"],
  },
  "robot-store": {
    id: "robot-store",
    name: "Cybernetics & Droids",
    theme: "1X Neo bipedal humanoid robots, luminous walkers, cybernetic parts",
    tags: [
      "robot",
      "droid",
      "mech",
      "cyberpunk",
      "humanoid",
      "scifi",
      "character",
    ],
  },
  "four-fields": {
    id: "four-fields",
    name: "Farming & Agriculture",
    theme: "Farmsteads, mature corn crops, scythes, farm harvest ambience",
    tags: ["farm", "crops", "agriculture", "nature", "harvest", "scythe"],
  },
  "kirby-smash": {
    id: "kirby-smash",
    name: "Smash Arena Combat",
    theme: "Floating combat platforms, blast zones, brawler stages",
    tags: ["smash", "combat", "arena", "platform", "fighting", "brawler"],
  },
  "mint-putt": {
    id: "mint-putt",
    name: "Mini-Golf & Hazards",
    theme: "Golf fairways, putters, cups, drop audio, sports hazards",
    tags: ["golf", "sports", "ball", "putter", "course", "arcade"],
  },
  "mint-hoops": {
    id: "mint-hoops",
    name: "Arcade Basketball",
    theme: "Monogram basketball hoops, nets, rims, basketball court",
    tags: ["basketball", "hoop", "sports", "nba", "ball"],
  },
  "drone-delivery": {
    id: "drone-delivery",
    name: "Drone Flight & Rooftops",
    theme:
      "Quadcopter drones, city antennas, apartment rooftops, delivery packages",
    tags: ["drone", "flight", "city", "delivery", "rooftop", "aerial"],
  },
  "cdx-2089-music-player": {
    id: "cdx-2089-music-player",
    name: "Cyberpunk Audio & Chassis",
    theme:
      "Disc bastion chassis, dials, acrylic disc frames, electronic music tracks",
    tags: ["cyberpunk", "music", "audio", "rhythm", "synth", "chassis"],
  },
}

/**
 * Lists available themed asset packs, optionally filtered by keyword.
 */
export function listPacks(query?: string): AssetPackInfo[] {
  const q = query?.toLowerCase().trim()
  if (!q) return Object.values(ASSET_PACKS)
  return Object.values(ASSET_PACKS).filter(
    (p) =>
      p.id.includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.theme.toLowerCase().includes(q) ||
      p.tags.some((t) => t.includes(q) || q.includes(t))
  )
}

/**
 * Searches the 1,845 public CDN assets by keyword, category, or pack ID.
 * Matches filenames, keys, pack IDs, and semantic pack tags.
 */
export function searchAssets(
  query: string = "",
  category?: MasterAssetEntry["cat"],
  pack?: string
): Array<{ key: string } & MasterAssetEntry> {
  const q = query.toLowerCase().trim()
  const pFilter = pack?.toLowerCase().trim()
  const results: Array<{ key: string } & MasterAssetEntry> = []

  for (const [key, entry] of Object.entries(MASTER_ASSETS)) {
    if (category && entry.cat !== category) continue
    if (pFilter && entry.exp.toLowerCase() !== pFilter) continue

    if (entry.size === 0 || key.includes("decoder_path") || key.includes("preview_image")) {
      continue
    }

    if (!q) {
      results.push({ key, ...entry })
      if (results.length >= 40) break
      continue
    }

    const keyLower = key.toLowerCase()
    const fileLower = entry.file.toLowerCase()
    const expLower = entry.exp.toLowerCase()

    // 1. Direct match on key, filename, or pack
    let matched =
      keyLower.includes(q) || fileLower.includes(q) || expLower.includes(q)

    // 2. Semantic tag match via parent asset pack
    if (!matched && ASSET_PACKS[entry.exp]) {
      const packInfo = ASSET_PACKS[entry.exp]
      matched = packInfo.tags.some(
        (tag) => tag.includes(q) || q.includes(tag)
      )
    }

    if (matched) {
      results.push({ key, ...entry })
      if (results.length >= 40) break
    }
  }

  return results
}

/**
 * Resolves a key (e.g. "knightfall:batman", "tiny-boat-docking:boat_red_runabout") to its CDN URL.
 */
export function getAssetUrl(key: string): string | undefined {
  return MASTER_ASSETS[key]?.url
}

