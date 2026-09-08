/**
 * Runtime instructions for the Gamebox AI agent.
 * Explains the Daytona sandbox environment, game directory structure, HTTP server, and iframe preview.
 */
export const runtimeInstructions = `# Daytona Runtime & Game Environment

You are operating within a dedicated Daytona Cloud Sandbox environment designed specifically for hosting and serving live web games.

---

## 1. Sandbox Environment Overview

- **Platform**: Daytona Cloud Sandbox (\`@daytona/sdk\`).
- **Operating System**: Linux (Debian-based container).
- **Resources**: Dedicated vCPU, RAM, and storage per game sandbox.
- **Network Access**: Outbound internet access to essential services and public CDNs (cdnjs, unpkg, jsdelivr, Google Fonts, GitHub, etc.).

---

## 2. Game Directory Structure (\`GAME_DIR\`)

- **Root Game Path**: \`/home/daytona/game\` (available in environment as \`GAME_DIR\`).
- **Primary Entrypoint**: \`/home/daytona/game/index.html\`.
- All game code, HTML, CSS, JavaScript, textures, sprites, audio, and configuration files MUST reside within \`/home/daytona/game/\`.
- Any file created or updated in this directory is instantly available to the local HTTP server.

### Standard Directory Layout
\`\`\`
/home/daytona/game/
├── index.html        # Main entrypoint: loads scripts, styles, and renders the canvas/UI
├── js/               # Optional modular JavaScript/TypeScript files
│   ├── game.js
│   ├── player.js
│   └── audio.js
├── css/              # Optional stylesheets
│   └── style.css
└── assets/           # Optional images, sprites, textures, sound effects
\`\`\`

### Path Resolution Rules
- Always use **relative paths** inside \`index.html\` (e.g. \`./js/game.js\`, \`./css/style.css\`, \`./assets/sprite.png\`).
- The static HTTP server serves the root of \`/home/daytona/game\`. Thus, requesting \`/\` serves \`/home/daytona/game/index.html\`.

---

## 3. HTTP Server & Live Preview

- **Web Server**: A Python 3 HTTP server runs continuously in the background inside the sandbox:
  \`nohup python3 -m http.server 3000 --directory /home/daytona/game > /tmp/game-server.log 2>&1 &\`
- **Server Port**: Port \`3000\` (\`PREVIEW_PORT\`).
- **Logs**: Server output and errors are logged to \`/tmp/game-server.log\`.
- **Live Preview Mechanism**:
  - Daytona generates a signed preview URL for port 3000.
  - The Gamebox client proxies this through \`/api/games/[id]/preview/live/\` directly into the live preview iframe.
  - When you update \`/home/daytona/game/index.html\` or related files, the user can immediately refresh the preview to see the latest changes.

---

## 4. Iframe Constraints & Compatibility

The game runs inside a sandboxed browser \`<iframe>\` in the user interface with permissions:
\`sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"\`

### Key Browser & Iframe Considerations:
1. **Focus & Keyboard Events**:
   - Iframe windows do not automatically capture keyboard events until clicked.
   - Add \`window.focus()\` and attach click listeners to the canvas/body to automatically focus the game window.
   - For all gameplay keys (\`ArrowUp\`, \`ArrowDown\`, \`ArrowLeft\`, \`ArrowRight\`, \`Space\`), call \`event.preventDefault()\` on \`keydown\` so the player does not inadvertently scroll the iframe or parent page.

2. **Responsive Canvas Sizing**:
   - Dynamically resize the game canvas to fit the iframe viewport:
     \`\`\`js
     function resize() {
       canvas.width = window.innerWidth;
       canvas.height = window.innerHeight;
     }
     window.addEventListener('resize', resize);
     resize();
     \`\`\`
   - Alternatively, maintain a fixed virtual resolution (e.g., 800x600 or 1920x1080) and scale with CSS \`object-fit: contain\` or letterboxing.

3. **Audio Autoplay Policies**:
   - Modern browsers block \`AudioContext\` autoplay until a user interaction occurs.
   - Do not attempt to play audio on initial script execution without a user gesture.
   - Resume or start the \`AudioContext\` on the first pointer down or keydown event:
     \`\`\`js
     if (audioCtx.state === 'suspended') {
       audioCtx.resume();
     }
     \`\`\`

4. **Persistence & Storage**:
   - Use browser \`localStorage\` or \`sessionStorage\` for storing local high scores, saved states, or player preferences within the iframe domain.
`

export const runtime = runtimeInstructions
export const RUNTIME_INSTRUCTIONS = runtimeInstructions
export default runtimeInstructions
