import * as Sentry from "@sentry/nextjs"
import { getOrgBalance, FREE_CREDIT_AMOUNT } from "./ledger"
import { reconcileOrganizationSubscription } from "./reconcile"

export { OUT_OF_CREDITS_MESSAGE } from "./constants"

export interface OrgCreditsCheck {
  allowed: boolean
  balance: bigint
  synced: boolean
}

/**
 * Checks if an organization has positive credit balance to start a build turn.
 * - If balance <= 0, syncs subscription with Clerk once first (a month may have renewed)
 * - Re-evaluates balance after sync
 * - Returns whether building is allowed (balance > 0)
 */
export async function checkAndSyncOrgCredits(
  orgId: string
): Promise<OrgCreditsCheck> {
  if (!orgId) {
    return {
      allowed: true,
      balance: FREE_CREDIT_AMOUNT,
      synced: false,
    }
  }

  try {
    let balance = await getOrgBalance(orgId)
    let synced = false

    if (balance <= BigInt(0)) {
      Sentry.logger.info(
        "Org balance is empty, syncing subscription before check",
        {
          orgId,
          currentBalance: balance.toString(),
        }
      )

      try {
        await reconcileOrganizationSubscription(orgId)
        synced = true
        balance = await getOrgBalance(orgId)
      } catch (syncError) {
        Sentry.logger.error("Failed to sync subscription during credit check", {
          orgId,
          error:
            syncError instanceof Error ? syncError.message : String(syncError),
        })
      }
    }

    const allowed = balance > BigInt(0)

    return {
      allowed,
      balance,
      synced,
    }
  } catch (error) {
    Sentry.logger.error("Error checking organization credits", {
      orgId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
