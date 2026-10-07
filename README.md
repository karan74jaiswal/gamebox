<div align="center">

<br />

<img src="./public/logo.svg" alt="Gamebox Logo" width="72" height="72" />

<br />
<br />

# Gamebox

<p><strong>Autonomous AI 3D Game Studio in the Browser</strong></p>

<p>Describe a game. Watch a collaborative multi-agent team architect, generate assets, and write the code. Play it live in your browser.</p>

<p>
  <a href="#features">Features</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#multi-agent-pipeline">Multi-Agent Pipeline</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#agent-tools">Tools</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#in-engine-toolkit">In-Engine Toolkit</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#how-it-works">Architecture</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#getting-started">Quick Start</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#deploy-on-vercel">Deploy on Vercel</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#tech-stack">Stack</a>
</p>

<br />

<p>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 16" /></a>&nbsp;
  <a href="https://vercel.com/"><img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" /></a>&nbsp;
  <a href="https://threejs.org/"><img src="https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js" /></a>&nbsp;
  <a href="https://ai-sdk.dev/"><img src="https://img.shields.io/badge/AI_SDK-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="AI SDK" /></a>&nbsp;
  <a href="https://trigger.dev/"><img src="https://img.shields.io/badge/Trigger.dev_v4-635BFF?style=for-the-badge&logo=triggerdotdev&logoColor=white" alt="Trigger.dev" /></a>&nbsp;
  <a href="https://daytona.io/"><img src="https://img.shields.io/badge/Daytona-0A0A0A?style=for-the-badge" alt="Daytona" /></a>&nbsp;
  <a href="https://neon.tech/"><img src="https://img.shields.io/badge/Neon_Postgres-00E599?style=for-the-badge&logo=neon&logoColor=black" alt="Neon" /></a>&nbsp;
  <a href="https://clerk.com/"><img src="https://img.shields.io/badge/Clerk-6C47FF?style=for-the-badge&logo=clerk&logoColor=white" alt="Clerk" /></a>&nbsp;
  <a href="https://sentry.io/"><img src="https://img.shields.io/badge/Sentry-362D59?style=for-the-badge&logo=sentry&logoColor=white" alt="Sentry" /></a>
</p>

</div>

<br />

> **Gamebox** turns a single descriptive premise into a complete, playable 3D browser game in minutes. Built on a collaborative multi-agent architecture, Gamebox orchestrates a Game Director, Art Director, and Gameplay Engineer to write real TypeScript source code, generate custom textures and audio, compile inside an isolated cloud sandbox, and stream the running game live beside the chat.

---

## Features

<table>
  <tr>
    <td width="50%" valign="top">
      <strong>Collaborative Multi-Agent Pipeline</strong><br />
      On Turn 1, a sequential trio of specialized agents (Game Director ➔ Art Director ➔ Gameplay Engineer) coordinates architecture, assets, and code before delivering a complete vertical slice.
    </td>
    <td width="50%" valign="top">
      <strong>Live In-Browser Sandboxes & Preview</strong><br />
      Every game boots inside its own isolated Linux cloud sandbox (<a href="https://daytona.io/">Daytona</a>), running a Vite dev server proxied directly to an interactive, full-screenable iframe next to the chat.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Multimodal Asset Generation</strong><br />
      Agents synthesize custom 2D PBR surface textures using Google Gemini Image models and background audio tracks / seamless loops using Google Lyria models directly into sandbox storage.
    </td>
    <td width="50%" valign="top">
      <strong>Batteries-Included 3D Engine Toolkit</strong><br />
      A pre-bundled Three.js engine provides instant game loop setup, trauma screenshake, hitstop freeze, PBR material recipes, procedural canvas textures, glassmorphic HUDs, Web Audio, and physics.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Mandatory In-Sandbox Compiler Gate</strong><br />
      Turns never finish with broken code. The engineer executes <code>tsc --noEmit</code> via <code>verify_game</code> inside the sandbox, fixing type errors and missing imports before concluding.
    </td>
    <td width="50%" valign="top">
      <strong>Durable & Resumable Agent Execution</strong><br />
      Tasks run as long-lived background chat agents on <a href="https://trigger.dev/">Trigger.dev</a>. SSE streams survive browser refreshes and network drops with automatic event cursor resumption.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Context & Memory Sanitization</strong><br />
      Historical tool outputs, compiler logs, and questionnaires are intelligently compacted and deduplicated across turns to keep LLM context lean, budget-friendly, and responsive.
    </td>
    <td width="50%" valign="top">
      <strong>Multi-Model Picker & Tiered Providers</strong><br />
      Build with Gemini 3.8 Flash, Grok 4.6, Claude Opus 5, or Claude Fable 5.1, routed across Google AI Studio, Vercel AI Gateway, and Google Cloud Vertex AI with automated rate-limit pacing.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Organization Workspaces & Billing</strong><br />
      Multi-tenant workspaces powered by Clerk. Free credits on signup, per-step token ledger tracking in nano-dollars, and automatic monthly credit top-ups with rollover.
    </td>
    <td width="50%" valign="top">
      <strong>Production Vercel & Sentry Telemetry</strong><br />
      Deployed natively on Vercel with streaming route proxies, <code>/monitoring</code> Sentry tunnel, and end-to-end exception and performance monitoring across web and worker processes.
    </td>
  </tr>
</table>

<br />

---

## Multi-Agent Pipeline

Building a complete, polished 3D game requires specialization. Rather than delegating design, aesthetics, sound, and low-level Three.js code to a single generic prompt, Gamebox executes a **collaborative 3-phase pipeline on Turn 1**:

```mermaid
flowchart TD
    User(["User Prompt: Synthwave drift racer with boost pads"]) --> Phase1
    
    subgraph P1 ["Phase 1: Game Director & Architect"]
        Phase1["Analyze Prompt & Plan"] --> LoopContract["Core Loop Contract & Mechanics"]
        Phase1 --> Lighting["3-Color Lighting Script: Strict No-White-Light"]
        Phase1 --> HUDTheme["Diegetic HUD Persona & Combat Tells"]
        Phase1 --> Manifest["Asset Manifest: Textures & Audio"]
        Manifest --> WritePlan[("write_file: artifacts/game-plan.md")]
    end
    
    WritePlan --> Phase2
    
    subgraph P2 ["Phase 2: Art Director & Asset Specialist"]
        Phase2["Read Asset Manifest"] --> GenTex["generate_texture: Gemini Image Models"]
        Phase2 --> GenAudio["generate_music: Google Lyria Models"]
        GenTex --> SaveTex[("assets/textures/*.png")]
        GenAudio --> SaveAudio[("assets/audio/*.mp3")]
        SaveTex --> UpdatePlan[("Update artifacts/game-plan.md")]
        SaveAudio --> UpdatePlan
    end
    
    UpdatePlan --> Phase3
    
    subgraph P3 ["Phase 3: Lead Gameplay Engineer"]
        Phase3["Bind Assets & Author Three.js Source"] --> Lifecycle["5-State Lifecycle: Load, Start, Play, Pause, End"]
        Lifecycle --> ShaderWarm["Shader Pre-Warming: renderer.compile"]
        Lifecycle --> SoundRig["Web Audio & Game Feel Wiring"]
        Lifecycle --> VerifyCheck{"verify_game: tsc --noEmit"}
        VerifyCheck -- "Errors Found" --> SurgFix["Surgical Fixes: replace_text"]
        SurgFix --> VerifyCheck
        VerifyCheck -- "0 Errors Passed" --> CommitGit["Git Checkpoint & artifacts/game-state.md"]
    end
    
    CommitGit --> LivePreview(["Live Interactive Preview"])
```

### Turn 1: Initial Creation
1. **Phase 1 — Game Director & Creative Architect**: Defines the Core Loop Contract, establishing the player fantasy, high-stakes objectives, a genre-specific diegetic HUD, 3-step enemy attack telegraphs (wind-up, strike, recovery), a cinematic 3-color lighting palette (key light, fill light, accent rim), and the Asset Manifest in `artifacts/game-plan.md`.
2. **Phase 2 — Art Director & Asset Specialist**: Synthesizes the required PBR textures and background music tracks/loops directly into the sandbox filesystem (`assets/textures/` and `assets/audio/`), updating the manifest with verified paths.
3. **Phase 3 — Lead Gameplay Engineer**: Authors clean, modular TypeScript source files (`game.ts`, `player.ts`, etc.), binds the pre-generated textures and audio, implements the complete 5-state lifecycle, pre-warms shaders to prevent initial frame hitching, runs `verify_game` to guarantee 0 compiler errors, records an operational snapshot in `artifacts/game-state.md`, and commits a Git checkpoint.

### Turn 2+: Surgical Iteration & Bug Fixing
- **Lead Gameplay Engineer executes directly**: Inspects existing source and project memory artifacts, applies surgical line edits via `replace_text` or `update_file`, verifies compilation with `verify_game`, updates `artifacts/game-state.md`, and commits a Git checkpoint.

---

## Agent Tools

All file and execution operations run inside the sandbox root (`/home/daytona/game`). Strict boundary validation prevents directory traversal attacks outside the sandbox.

| Tool | Category | Description |
| :--- | :--- | :--- |
| `generate_texture` | **Asset AI** | Synthesizes seamless 2D PBR textures, stone tiles, sci-fi panels, and terrain using Gemini Image models (`gemini-3.1-flash-image`, `nano-banana-pro-preview`) saved to `assets/textures/<name>.png`. |
| `generate_music` | **Asset AI** | Generates thematic background music tracks or seamless audio loops using Google Lyria models (`lyria-3.5`, `lyria-3-clip-preview`) saved to `assets/audio/<name>.mp3`. |
| `verify_game` | **Quality Gate** | Executes `tsc --noEmit` inside the Daytona sandbox. Returns exact compiler errors, line numbers, and missing exports so the agent fixes them before concluding. |
| `inspect_symbols` | **Language Server** | Queries the Daytona Language Server Protocol (LSP) to extract exported classes, functions, and interfaces in under 120 tokens without dumping full files. |
| `ask_player` | **Briefing** | Renders an interactive multi-choice questionnaire (covering loop, goal, world, look, feel, challenge, or controls) pausing execution until the user selects an option. |
| `write_file` | **Filesystem** | Creates or fully overwrites text and source code files. (Strictly prohibited on binary assets). |
| `replace_text` | **Filesystem** | Performs surgical, deterministic text replacement on exact snippets within an existing file. |
| `update_file` | **Filesystem** | Executes targeted line operations (`replace_lines`, `insert_at_line`, `append`, `prepend`). |
| `read_file` | **Filesystem** | Reads UTF-8 source code for text files, or returns data URLs and Three.js loading boilerplate for binary media assets. |
| `list_files` | **Filesystem** | Explores the file tree inside the game directory. |
| `delete_file` | **Filesystem** | Removes obsolete source files or unused media assets. |

---

## Bundled Agent Skills

Trigger.dev tasks in Gamebox are backed by **9 specialized Three.js skills** located in `skills/`, resolved dynamically via `skills.define`:

| Skill | Role & Capabilities |
| :--- | :--- |
| `threejs-game-director` | Defines high-concept vision, Core Loop Contract, project roadmaps, and visual scorecards. |
| `threejs-aaa-graphics-builder` | Directs 3-color lighting rigs, PBR material recipes, procedural geometry kits, and GLSL shaders. |
| `threejs-gameplay-systems` | Manages player controls, camera rigs, entity lifecycles, and physics selection (arcade vs Rapier). |
| `threejs-game-ui-designer` | Builds diegetic glassmorphic HUDs, health bars, score badges, modal menus, and touch controls. |
| `threejs-image-generator` | Manages 2D texture generation prompts, canvas fallbacks, and PBR repeat settings. |
| `threejs-audio-generator` | Generates background music prompts and manages 6-channel Web Audio sound recipes. |
| `threejs-3d-generator` | Handles compound procedural geometry, model loading, and Draco compression. |
| `threejs-debug-profiler` | Diagnoses WebGL context issues, canvas failures, memory leaks, and frame rate bottlenecks. |
| `threejs-qa-release` | Provides automated browser QA hooks, canvas pixel validation, and deterministic playtest bots. |

---

<a id="in-engine-toolkit"></a>
## In-Engine Toolkit (`./engine`)

Seeded directly into every sandbox is a modular, high-performance 3D engine built on top of Three.js. Agents import from `./engine/index.ts` rather than reinventing foundational boilerplate:

```ts
import { 
  createGame, 
  lights, 
  createHeroVehicle, 
  CameraRig, 
  createMaterialKit 
} from "./engine/index.ts"

// Initialize scene, camera, renderer, loop, audio mixer, and inputs in one call
const game = createGame({ background: "#0b1020" })

// Atmospheric 3-color lighting setup
lights.sunset(game.scene, { area: 40 })

// Authored compound actor with articulated parts & collision bounds
const player = createHeroVehicle({ colors: { hull: "#1e293b", accent: "#06b6d4" } })
game.add(player.root)

// AAA Camera Rig with exponential lag damping, velocity lookahead & trauma shake
const cameraRig = new CameraRig(game.camera, { distance: 10, height: 4.5, lag: 0.16 })
cameraRig.snapTo(player.root.position)

// Game loop with unscaled raw delta for cameras and scaled delta for gameplay
game.onUpdate((dt) => {
  player.root.position.x += game.input.move.x * 10 * dt
  if (game.input.pressed("fire")) {
    game.audio.playWithCooldown("laser", 120, { vary: 0.1 })
    cameraRig.punchFov(5)
  }
})

game.onLateUpdate((dt) => {
  cameraRig.update(dt, player.root.position)
})
```

### Core Engine Systems
- **`gameFeel`**: Trauma-based camera shake (`ShakeRig` using `trauma²` with linear decay), `HitstopManager` (time-dilation impact freeze for heavy hits), `squashAndStretch` (volume-preserving scaling), `FovPuncher`, and `flashHit` emissive pulses.
- **`CameraRig`**: Follow camera with exponential damping, lookAhead targeting, trauma shake integration, and collision pull-in.
- **`materials`**: PBR recipes (`paintedMetal`, `brushedMetal`, `rubber`, `mattePlastic`, `glossyCeramic`, `emissiveSignal`), procedural canvas textures (`trimSheet`, `hazardStripes`, `panelLines`, `stoneTiles`, `noiseGrain`), and custom shader hooks (`applyFresnelRim`, `applyScrollingEmissive`, `applyWindSway`, `createSkyDome`).
- **`models`**: Authored compound geometry factories (`createHeroVehicle`, `createHeroCharacter`, `createObstacle`, `createReward`, `createWorldPropKit`), `createPool` mesh recycling, and Draco-compressed GLB loading.
- **`hud`**: Modern game UI widgets (`createHealthBar` with delayed damage trail + shield, `createObjectiveCard`, `createScoreBadge`, `createModalOverlay`, `createTouchControls` virtual thumbstick).
- **`sound`**: 6-channel Web Audio synthesizer & studio mixer (`master`, `sfx`, `ui`, `ambience`, `voice`, `music`), ducking (`audio.duck`), cooldown protection (`audio.playWithCooldown`), 3D spatial panning (`audio.playAt`), and music streaming (`audio.playMusic`).
- **`physics`**: Built-in arcade collision (`createPhysics`) or pre-installed `@dimforge/rapier3d-compat` (Rust/WASM rigid-body simulation).
- **Diagnostics & Testing**: Automatic hooks on `window.__THREE_GAME_DIAGNOSTICS__` and `window.__THREE_GAME_TEST_HOOKS__` (`seed`, `setState`, `setPausedForScreenshot`) for deterministic testing.

---

## How It Works

```mermaid
flowchart LR
    subgraph Client ["Client Browser"]
        Composer["Chat Composer & Model Picker"]
        LiveIframe["Live Preview Iframe"]
        ReportScript["report.js: In-Frame Error Trap"]
    end

    subgraph VercelApp ["Next.js 16 on Vercel"]
        ServerActions["Server Actions: createGame, startSession"]
        ProxyRoute["/api/games/[id]/preview/live/*: maxDuration = 60"]
        TunnelRoute["/monitoring: Sentry Tunnel"]
        ClerkAuth["Clerk Middleware: proxy.ts"]
    end

    subgraph DataStore ["Database & Storage"]
        NeonDB[("Neon Serverless Postgres")]
        CreditTable["credit_ledger: Nano-dollars"]
    end

    subgraph TriggerWorker ["Trigger.dev v4 Worker"]
        ChatAgent["chat.agent: game-chat"]
        Sanitizer["Context Sanitizer & Compactor"]
        SkillsLoader["Trigger Skills Loader"]
        TitleTask["Deferred Title Generator"]
    end

    subgraph CloudSandbox ["Daytona Linux Sandbox"]
        ViteDev["Vite Dev Server: Port 3000"]
        GameFiles["/home/daytona/game: TypeScript Source"]
        EngineToolkit["./engine: Seeded Three.js Toolkit"]
        GitRepo["Git Repository Checkpoints"]
        LSP["Daytona LSP Server"]
    end

    Composer -->|"Create Game & Start Turn"| ServerActions
    ServerActions -->|"Start Chat Session"| ChatAgent
    ChatAgent -->|"Stream SSE: Reasoning, Tools, Text"| Composer
    ChatAgent -->|"File Edits & Typecheck"| GameFiles
    ChatAgent -->|"Symbol Lookup"| LSP
    ChatAgent -->|"Record Step Cost"| CreditTable
    GameFiles -->|"Vite HMR & Serve"| ViteDev
    ViteDev -->|"Proxied via Signed URL"| ProxyRoute
    ProxyRoute -->|"Render Preview"| LiveIframe
    ReportScript -->|"postMessage Diagnostics"| Composer
    ServerActions -->|"Neon Pooler / WS"| NeonDB
```

1. **Game Creation**: The user enters a premise in the home composer. A new game record is created in Neon Postgres, and the user navigates to `/games/[id]`.
2. **Daytona Provisioning**: The first turn initializes a Daytona sandbox from cold snapshot `gamebox-runtime-v5` in ~2.5s, hosting the Vite server and pre-seeded `./engine` toolkit at `/home/daytona/game`.
3. **Turn 1 Orchestration**: Trigger.dev invokes the 3-agent pipeline (Architect ➔ Artist ➔ Engineer). Textures and music are synthesized, Three.js source is written, and `verify_game` confirms 0 TypeScript compiler errors.
4. **Live Preview Proxy**: Next.js route `/api/games/[id]/preview/live/*` securely proxies the sandbox Vite dev server to the client iframe, injecting custom scrollbars and caching signed URLs.
5. **Runtime Error Trap**: `report.js` inside the iframe catches any syntax errors, 404 asset loads, or unhandled exceptions, passing them over `postMessage` so the app displays actionable diagnostic banners instead of a blank screen.
6. **Git Checkpoints**: Each completed turn commits a checkpoint commit directly to the sandbox's internal Git repository.
7. **Credit Accounting**: Every generation step computes exact token usage across input, cached read/write, and output tokens, deducting from the organization's nano-dollar credit ledger.

---

## Token Pricing & Billing Model

Gamebox uses **integer nano-dollars** (`1 USD = 1,000,000,000 nano-dollars`) to track usage without floating-point rounding errors.

### Model Rates (per million tokens)

| Model ID | Provider | Fresh Input | Cache Read | Cache Write | Output |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `google/gemini-3.8-flash` *(Default)* | Google | $0.15 | $0.0375 | $0.0375 | $0.60 |
| `xai/grok-4.6` | xAI | $2.00 | $0.50 | $2.00 | $10.00 |
| `anthropic/claude-opus-5` | Anthropic | $15.00 | $1.50 | $18.75 | $75.00 |
| `anthropic/claude-fable-5-1` | Anthropic | $3.00 | $0.30 | $3.75 | $15.00 |

### Credit Grants & Subscriptions
- **Free Trial**: Every new organization receives **$1.00 free credit** (`1,000,000,000n`) automatically.
- **Builder Subscription**: Clerk Billing adds **$10.00 monthly credits** (`10,000,000,000n`) with rollover.
- **Safety Guard**: If an organization's balance hits `<= 0`, new turns are paused, prompting the user with an in-chat upgrade banner linking directly to `/billing`.

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.x` or `v22.x`
- **Package Manager**: `npm`
- **Services**:
  - [Clerk](https://clerk.com/) (with **Organizations** enabled)
  - [Neon Postgres](https://neon.tech/) (Serverless Postgres database)
  - [Google AI Studio](https://aistudio.google.com/) or [Google Cloud Vertex AI](https://cloud.google.com/vertex-ai)
  - [Trigger.dev](https://trigger.dev/) (v4 project)
  - [Daytona](https://daytona.io/) account and API key
  - [Sentry](https://sentry.io/) (optional, for monitoring)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-username/gamebox.git
cd gamebox
npm install
```

### 2. Configure Environment Variables

Create `.env.local` in the project root:

```env
# Clerk Authentication & Multi-Tenancy
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

# Neon Database (Direct and Pooled connections)
DATABASE_URL=postgresql://user:pass@ep-pooler.region.neon.tech/neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://user:pass@ep-direct.region.neon.tech/neondb?sslmode=require

# AI Providers (Google AI Studio / Vertex AI / Anthropic / xAI)
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSy...
# Or Vertex AI Service Account:
# GOOGLE_VERTEX_PROJECT=your-gcp-project
# GOOGLE_VERTEX_CLIENT_EMAIL=sa@project.iam.gserviceaccount.com
# GOOGLE_VERTEX_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
# Optional alternative models:
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=xai-...
AI_GATEWAY_API_KEY=...

# Trigger.dev Background Workers
TRIGGER_SECRET_KEY=tr_dev_...

# Daytona Cloud Sandboxes
DAYTONA_API_KEY=dtn_...
DAYTONA_SNAPSHOT_NAME=gamebox-runtime-v5

# Sentry Monitoring (Optional)
NEXT_PUBLIC_SENTRY_DSN=https://...
SENTRY_DSN=https://...
SENTRY_ORG=your-sentry-org
SENTRY_PROJECT=gamebox
SENTRY_AUTH_TOKEN=sntrys_...
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
```

### 3. Synchronize Database Schema

Apply the Drizzle ORM schema directly to Neon:

```bash
npm run db:push
```

> [!IMPORTANT]
> Always use `npm run db:push` (`drizzle-kit push`). Migration generation and migration files are forbidden in this project.

### 4. Build or Pre-Seed the Daytona Snapshot (Optional)

Gamebox launches games from a pre-built Daytona snapshot (`gamebox-runtime-v5`) in ~2.5 seconds. To build your own snapshot:

```bash
npm run daytona:snapshot
```

*(If no snapshot exists, Gamebox automatically falls back to creating a `daytona-small` sandbox and seeding the engine files on demand).*

### 5. Start the Trigger.dev Worker

In a separate terminal, launch the local Trigger.dev development runtime:

```bash
npm run trigger:dev
```

### 6. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in via Clerk, choose or create an organization workspace, and describe your first game!

---

## Deploy on Vercel

Gamebox is deployed as a hybrid cloud architecture: **Next.js 16 on Vercel**, **Trigger.dev Cloud** for durable background agents, **Daytona** for Linux game sandboxes, and **Neon** for serverless PostgreSQL.

```mermaid
flowchart TD
    subgraph Vercel ["Vercel Deployment"]
        NextWeb["Next.js 16 Web Application"]
        ServerActionsProd["Server Actions & Clerk Auth"]
        ProxyLive["/api/games/[id]/preview/live/*"]
        SentryTunnel["/monitoring: Telemetry Tunnel"]
    end

    subgraph CloudServices ["Managed Cloud Backends"]
        TriggerCloud["Trigger.dev Cloud: Node 24 Worker"]
        DaytonaCloud["Daytona Cloud: Linux Sandboxes"]
        NeonCloud["Neon Postgres: Compute & PgBouncer"]
        ClerkCloud["Clerk: Auth & Billing"]
        SentryCloud["Sentry: Error & Trace Platform"]
    end

    NextWeb --> ClerkCloud
    NextWeb --> NeonCloud
    ServerActionsProd --> TriggerCloud
    TriggerCloud --> DaytonaCloud
    ProxyLive --> DaytonaCloud
    NextWeb --> SentryCloud
    TriggerCloud --> SentryCloud
```

### 1. Import Repository into Vercel

1. Push your repository to GitHub.
2. In the [Vercel Dashboard](https://vercel.com/), click **Add New** ➔ **Project** and import your repository.
3. Keep the default build settings:
   - **Framework Preset**: Next.js
   - **Build Command**: `npm run build`
   - **Install Command**: `npm install`
   - **Output Directory**: `.next`

### 2. Configure Production Environment Variables

Add the following environment variables in your Vercel project settings (**Settings** ➔ **Environment Variables**):

| Variable | Description |
| :--- | :--- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Production Publishable Key (`pk_live_...`) |
| `CLERK_SECRET_KEY` | Clerk Production Secret Key (`sk_live_...`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Set to `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Set to `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Set to `/` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Set to `/` |
| `DATABASE_URL` | Neon pooled connection string (`-pooler.neon.tech`) |
| `DATABASE_URL_UNPOOLED` | Neon direct unpooled connection string (`ep-....neon.tech`) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI Studio API Key for Gemini & image/music generation |
| `GOOGLE_VERTEX_PROJECT` | *(Optional)* GCP Project ID for Vertex AI fallback |
| `GOOGLE_VERTEX_LOCATION` | Set to `global` (or regional endpoint) |
| `GOOGLE_VERTEX_CLIENT_EMAIL` | *(Optional)* GCP Service Account Client Email |
| `GOOGLE_VERTEX_PRIVATE_KEY` | *(Optional)* GCP Service Account Private Key |
| `TRIGGER_SECRET_KEY` | Trigger.dev Production Secret Key (`tr_prod_...`) |
| `DAYTONA_API_KEY` | Daytona API Key |
| `DAYTONA_SNAPSHOT_NAME` | Name of your pre-built snapshot (e.g. `gamebox-runtime-v5`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for frontend monitoring |
| `SENTRY_DSN` | Sentry DSN for server & edge monitoring |
| `SENTRY_AUTH_TOKEN` | Sentry Auth Token for uploading source maps during build |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project name (`gamebox`) |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Set to `production` |

### 3. Synchronize Database & Deploy Trigger.dev Worker

Before serving production traffic, push the schema to your production database and deploy the Trigger.dev agent worker:

```bash
# Push schema to production Neon database
npm run db:push

# Deploy chat agent tasks to Trigger.dev Cloud
npm run trigger:deploy
```

> [!TIP]
> `trigger:deploy` bundles the agent instructions, installs Daytona SDK dependencies, and registers the multi-agent task (`game-chat`).

### 4. Configure Clerk Production Domain

1. In the [Clerk Dashboard](https://dashboard.clerk.com/), add your Vercel production domain (e.g. `your-gamebox-app.vercel.app` or custom domain) to the allowed domain list.
2. Ensure **Organizations** are enabled under **Organization Settings**.
3. Under **Billing**, configure your subscription plans (e.g. Builder monthly plan).

### 5. Verify Sentry Telemetry & Rewrites

Gamebox includes a built-in Sentry reverse-proxy tunnel configured in `next.config.ts`:
```ts
tunnelRoute: "/monitoring"
```
This routes browser telemetry through your Next.js server to circumvent ad-blockers, ensuring reliable error detection in production.

---

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the local Next.js development server on port 3000 |
| `npm run build` | Compiles the production Next.js application |
| `npm start` | Runs the compiled Next.js production server |
| `npm run trigger:dev` | Starts the local Trigger.dev worker process |
| `npm run trigger:deploy` | Deploys tasks, skills, and agents to Trigger.dev Cloud |
| `npm run db:push` | Synchronizes Drizzle ORM schema directly with Neon Postgres |
| `npm run db:studio` | Launches Drizzle Studio GUI for database inspection |
| `npm run daytona:snapshot` | Builds and caches the cold-boot `gamebox-runtime-v5` Daytona snapshot |
| `npm run test:runtime` | Runs the comprehensive Node.js unit test suite for the `./engine` toolkit |
| `npm run typecheck` | Validates TypeScript types across the entire project |
| `npm run lint` | Runs ESLint analysis |
| `npm run format` | Formats code with Prettier and Tailwind plugin |

---

## Project Structure

```text
gamebox/
├── app/
│   ├── (app)/                          # Authenticated workspace routes
│   │   ├── page.tsx                    # Studio dashboard & starter suggestions
│   │   ├── layout.tsx                  # Sidebar & organization layout
│   │   ├── billing/page.tsx            # Credit balance & Clerk PricingTable
│   │   └── games/[id]/page.tsx         # Split-screen studio (Chat + Live Preview)
│   ├── api/games/[id]/preview/         # Sandbox server starter & signed URL issuer
│   │   └── live/[[...path]]/route.ts   # Reverse-proxy to sandbox Vite dev server (maxDuration=60)
│   ├── actions.ts                      # Server actions (startSession, mintChatToken)
│   ├── globals.css                     # Tailwind CSS & theme tokens
│   └── layout.tsx                      # Root HTML layout & theme providers
├── components/
│   ├── app-sidebar.tsx                 # Project list, credit meter, org switcher
│   ├── chat-composer.tsx               # Prompt composer & AI model selector
│   ├── chat-preview.tsx                # Preview iframe, reload, and error reporting
│   ├── chat-thread.tsx                 # Real-time message streaming & tool call viewer
│   ├── game-chat.tsx                   # Resizable split-pane layout (Chat / Preview)
│   ├── ask-player-questionnaire.tsx    # Interactive UI for ask_player questionnaires
│   ├── tool-call.tsx                   # Visual status markers for tool execution
│   └── ui/                             # shadcn/ui component primitives
├── lib/
│   ├── ai/                             # AI model definitions, providers & sanitizers
│   │   ├── models.ts                   # Gemini 3.8 Flash, Grok 4.6, Claude Opus 5
│   │   ├── provider.ts                 # Multi-tier provider resolution
│   │   ├── sanitizer.ts                # Cross-turn context pruning & compaction
│   │   └── vertex-fetch.ts             # SSE keepalive filter & quota pacing middleware
│   ├── credits/                        # Nano-dollar credit ledger & pricing models
│   ├── daytona/                        # Cloud sandbox client, utils, and snapshot builder
│   ├── db/                             # Drizzle ORM schema & Neon database connections
│   └── games/
│       ├── agents/                     # Specialized agent prompts (Architect, Artist, Engineer)
│       ├── instructions/               # Workflow, runtime, and engine guidelines
│       ├── runtime-ts/                 # Starter sandbox template & engine/ toolkit
│       │   ├── engine/                 # In-engine Three.js game development toolkit
│       │   ├── welcome.ts              # Initial 3D holding screen
│       │   ├── report.js               # In-iframe error trapping script
│       │   └── vite.config.ts          # Sandbox Vite configuration
│       └── tools.ts                    # Agent tool definitions (verify_game, generate_texture...)
├── skills/                             # 9 specialized Three.js Trigger.dev agent skills
├── trigger/
│   ├── chat.ts                         # Main Trigger.dev game-chat agent & multi-agent loop
│   ├── chat-helpers.ts                 # Credit charging, title gen, and context pacing
│   └── game-skills.ts                  # Local skill discovery and resolution
├── drizzle.config.ts                   # Drizzle ORM configuration
├── trigger.config.ts                   # Trigger.dev v4 project configuration
├── proxy.ts                            # Clerk middleware route matching
└── next.config.ts                      # Next.js configuration with Sentry integration
```

---

## Tech Stack

| Technology | Purpose |
| :--- | :--- |
| **Next.js 16 & React 19** | Modern App Router, Server Components, and Server Actions |
| **Vercel** | Global edge hosting, route handlers, and serverless compute |
| **Three.js** | 3D rendering engine, procedural canvas textures, and PBR materials |
| **Vercel AI SDK** | Streaming chat, tool calling, model abstractions, and UI integration |
| **Trigger.dev v4** | Durable background agents, resumable SSE streams, and skill extensions |
| **Daytona SDK** | On-demand Linux cloud sandboxes, snapshot boot, and LSP symbol server |
| **Neon & Drizzle ORM** | Serverless Postgres, dual HTTP/WebSocket pooling, and typed schemas |
| **Clerk** | Authentication, organization multi-tenancy, and subscription billing |
| **Google Gemini & Lyria** | Text, image generation (`generate_texture`), and audio (`generate_music`) |
| **Rapier 3D** | Optional high-performance Rust/WASM physics simulation |
| **Sentry** | End-to-end exception tracking, distributed tracing, and worker logs |
| **Tailwind CSS & shadcn/ui** | Responsive, glassmorphic UI design system and themes |

---

<div align="center">
  <sub>Built with ❤️ by Kartikey. Deployed on Vercel, powered by Next.js, Three.js, Trigger.dev, and Daytona.</sub>
</div>
