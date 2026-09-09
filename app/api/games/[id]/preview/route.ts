import {
  PREVIEW_PORT,
  PREVIEW_URL_TTL_SECONDS,
  startGameServer,
} from "@/lib/daytona/utils"
import { getGame } from "@/lib/games/queries"
import { setCachedPreviewUrl } from "./live/[[...path]]/route"

/**
 * The url a game's preview iframe loads.
 *
 * The preview panel calls this on mount, so it is also what brings the game's
 * server up: `startGameServer` reuses whatever is already running, and only
 * pays the start-up cost on the first load after a sandbox has gone idle.
 *
 * The url returned is our internal live proxy (/api/games/[id]/preview/live/)
 * which sends the X-Daytona-Skip-Preview-Warning header to bypass Daytona's
 * preview warning screen and allows custom scrollbar styling in the iframe.
 *
 * `getGame` resolves the organization from the session and scopes the lookup to
 * it, so a game belonging to another org — or a caller with no session at all —
 * is indistinguishable from a game that doesn't exist.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/games/[id]/preview">
) {
  try {
    const { id } = await ctx.params
    const game = await getGame(id)

    if (!game) {
      return Response.json({ error: "Game not found" }, { status: 404 })
    }

    // Null until the thread's first turn creates the sandbox, and for games made
    // before sandboxes existed. Neither has anything to preview yet.
    if (!game.sandboxId) {
      return Response.json(
        { error: "Game has no sandbox yet" },
        { status: 409 }
      )
    }

    const sandbox = await startGameServer(game.sandboxId)
    const { url } = await sandbox.getSignedPreviewUrl(
      PREVIEW_PORT,
      PREVIEW_URL_TTL_SECONDS
    )

    setCachedPreviewUrl(game.sandboxId, url, PREVIEW_URL_TTL_SECONDS)

    return Response.json({
      url: `/api/games/${id}/preview/live/`,
      externalUrl: url,
    })
  } catch (error) {
    console.error("Failed to generate preview URL:", error)
    const message =
      error instanceof Error ? error.message : "Failed to start game preview"
    return Response.json({ error: message }, { status: 500 })
  }
}
