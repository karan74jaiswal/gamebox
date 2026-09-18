import fs from "node:fs"
import path from "node:path"
import { NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import {
  PREVIEW_PORT,
  PREVIEW_URL_TTL_SECONDS,
  startGameServer,
} from "@/lib/daytona/utils"
import { getGame } from "@/lib/games/queries"

// In-memory cache for preview base URLs to keep asset requests fast
const previewUrlCache = new Map<string, { url: string; expiresAt: number }>()

let cachedLogoSvg: string | null = null
function getLogoSvg(): string | null {
  if (!cachedLogoSvg) {
    try {
      const logoPath = path.resolve(process.cwd(), "public/logo.svg")
      if (fs.existsSync(logoPath)) {
        cachedLogoSvg = fs.readFileSync(logoPath, "utf-8")
      }
    } catch {
      // Ignore
    }
  }
  return cachedLogoSvg
}

export function setCachedPreviewUrl(
  sandboxId: string,
  url: string,
  ttlSeconds: number = PREVIEW_URL_TTL_SECONDS
) {
  previewUrlCache.set(sandboxId, {
    url,
    expiresAt: Date.now() + Math.max(ttlSeconds - 120, 60) * 1000,
  })
}

const SCROLLBAR_STYLE = `
<style id="gamebox-preview-scrollbars">
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(120, 120, 120, 0.4) transparent;
  }
  *::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  *::-webkit-scrollbar-track {
    background: transparent;
  }
  *::-webkit-scrollbar-thumb {
    background-color: rgba(120, 120, 120, 0.4);
    border-radius: 9999px;
    border: 1px solid transparent;
    background-clip: padding-box;
  }
  *::-webkit-scrollbar-thumb:hover {
    background-color: rgba(120, 120, 120, 0.7);
  }
</style>
`

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path: subpaths } = await ctx.params

  const game = await getGame(id)
  if (!game || !game.sandboxId) {
    Sentry.logger.warn("Live preview proxy game sandbox not found", { gameId: id })
    return new Response("Game sandbox not found", { status: 404 })
  }

  const now = Date.now()
  let cached = previewUrlCache.get(game.sandboxId)

  if (!cached || cached.expiresAt <= now) {
    const sandbox = await startGameServer(game.sandboxId, PREVIEW_PORT, id)
    const { url } = await sandbox.getSignedPreviewUrl(
      PREVIEW_PORT,
      PREVIEW_URL_TTL_SECONDS
    )
    cached = {
      url,
      expiresAt: now + (PREVIEW_URL_TTL_SECONDS - 120) * 1000,
    }
    previewUrlCache.set(game.sandboxId, cached)
  }

  const subpath = subpaths && subpaths.length > 0 ? subpaths.join("/") : ""
  const buildTargetUrl = (base: string) => {
    const baseParsed = new URL(base)
    // Vite base in sandbox is configured to /api/games/${id}/preview/live/
    const targetPath = `/api/games/${id}/preview/live/${subpath}`
    const target = new URL(targetPath, baseParsed.origin)
    baseParsed.searchParams.forEach((val, key) => {
      target.searchParams.set(key, val)
    })
    request.nextUrl.searchParams.forEach((val, key) => {
      target.searchParams.set(key, val)
    })
    return target
  }

  const targetUrl = buildTargetUrl(cached.url)

  const forwardHeaders = new Headers(request.headers)
  forwardHeaders.set("X-Daytona-Skip-Preview-Warning", "true")
  forwardHeaders.set("X-Daytona-Trust-Forwarded-Host", "true")
  const hostHeader = request.headers.get("host")
  if (hostHeader) {
    forwardHeaders.set("X-Forwarded-Host", hostHeader)
  }
  forwardHeaders.delete("host")

  let response = await fetch(targetUrl.toString(), {
    method: request.method,
    headers: forwardHeaders,
  })

  // Retry once if sandbox restarted or token expired
  if (response.status === 502 || response.status === 400) {
    Sentry.logger.warn("Live preview proxy upstream retry on error status", {
      gameId: id,
      sandboxId: game.sandboxId,
      upstreamStatus: response.status,
    })
    previewUrlCache.delete(game.sandboxId)
    const sandbox = await startGameServer(game.sandboxId, PREVIEW_PORT, id)
    const { url } = await sandbox.getSignedPreviewUrl(
      PREVIEW_PORT,
      PREVIEW_URL_TTL_SECONDS
    )
    cached = {
      url,
      expiresAt: now + (PREVIEW_URL_TTL_SECONDS - 120) * 1000,
    }
    previewUrlCache.set(game.sandboxId, cached)

    const retryTargetUrl = buildTargetUrl(cached.url)

    response = await fetch(retryTargetUrl.toString(), {
      method: request.method,
      headers: forwardHeaders,
    })
  }

  // If favicon was requested but upstream returned 404 (e.g. older sandbox), fallback to app logo
  if (
    response.status === 404 &&
    (subpath === "favicon.svg" || subpath === "favicon.ico")
  ) {
    const logoSvg = getLogoSvg()
    if (logoSvg) {
      return new Response(logoSvg, {
        status: 200,
        headers: {
          "content-type": "image/svg+xml",
          "cache-control": "public, max-age=86400",
        },
      })
    }
  }

  const contentType = response.headers.get("content-type") || ""

  // Inject base tag, favicon, and custom scrollbar styling into HTML documents
  if (contentType.includes("text/html")) {
    let html = await response.text()
    const baseTag = `<base href="/api/games/${id}/preview/live/">`
    const faviconTag =
      !html.includes('rel="icon"') && !html.includes("rel='icon'")
        ? `\n  <link rel="icon" type="image/svg+xml" href="./favicon.svg" />`
        : ""
    const injectedHead = `<head>\n  ${baseTag}${faviconTag}\n  ${SCROLLBAR_STYLE}`

    if (html.includes("<head>")) {
      html = html.replace("<head>", injectedHead)
    } else if (html.includes("<html>")) {
      html = html.replace(
        "<html>",
        `<html>\n${injectedHead}\n</head>`
      )
    } else {
      html = `<!DOCTYPE html>\n<html>\n${injectedHead}\n</head>\n<body>\n${html}\n</body>\n</html>`
    }

    const resHeaders = new Headers(response.headers)
    resHeaders.delete("content-encoding")
    resHeaders.delete("content-length")
    resHeaders.set("content-type", "text/html; charset=utf-8")

    return new Response(html, {
      status: response.status,
      headers: resHeaders,
    })
  }

  const resHeaders = new Headers(response.headers)
  resHeaders.delete("content-encoding")

  return new Response(response.body, {
    status: response.status,
    headers: resHeaders,
  })
}
