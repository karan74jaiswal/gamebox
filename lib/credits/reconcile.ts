import { clerkClient } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"

import { db, creditLedger } from "@/lib/db"

// +$10.00 per paid month in billionths of a dollar (nano-dollars)
export const SUBSCRIPTION_MONTHLY_CREDIT = BigInt("10000000000")

function toDate(timestamp: number | undefined | null): Date | null {
  if (!timestamp) return null
  // Normalize seconds to milliseconds if needed
  const ms = timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp
  return new Date(ms)
}

/**
 * Reconciles organization subscription credits with the credit_ledger table.
 * - Reads the organization's subscription using Clerk's `getOrganizationBillingSubscription`
 * - Inserts a credit_ledger row of +$10 per month paid for
 * - Uses ON CONFLICT DO NOTHING on (org_id, entry_key) to never grant the same month twice
 */
export async function reconcileOrganizationSubscription(
  orgId: string
): Promise<number> {
  if (!orgId) {
    return 0
  }

  // 1. Fetch the organization's billing subscription from Clerk
  let subscription: Awaited<
    ReturnType<
      Awaited<
        ReturnType<typeof clerkClient>
      >["billing"]["getOrganizationBillingSubscription"]
    >
  > | null = null

  try {
    const client = await clerkClient()
    subscription =
      await client.billing.getOrganizationBillingSubscription(orgId)
  } catch (error: unknown) {
    const errObj = error as {
      status?: number
      errors?: Array<{ code?: string; message?: string }>
      message?: string
    }

    const isNotFound =
      errObj?.status === 404 ||
      errObj?.errors?.[0]?.code === "resource_not_found" ||
      errObj?.message?.toLowerCase().includes("not found")

    if (isNotFound) {
      // Expected for organizations without a subscription
      return 0
    }

    Sentry.logger.warn(
      "Failed to retrieve organization billing subscription in reconcile",
      {
        orgId,
        error: error instanceof Error ? error.message : String(error),
      }
    )
    return 0
  }

  if (!subscription) {
    return 0
  }

  // Skip incomplete or abandoned subscriptions that haven't been successfully paid
  if (
    subscription.status === "incomplete" ||
    subscription.status === "abandoned"
  ) {
    return 0
  }

  const items = subscription.subscriptionItems ?? []
  const entryKeysToGrant = new Set<string>()

  // 2. Determine paid months across all active subscription items
  for (const item of items) {
    // Ignore free trials - credits are granted for paid months
    if (item.isFreeTrial) {
      continue
    }

    // Ignore free default plans
    const planSlug = item.plan?.slug?.toLowerCase()
    if (
      planSlug === "free_org" ||
      planSlug === "free" ||
      planSlug === "free_user"
    ) {
      continue
    }

    // Check if amount is explicitly 0
    if (
      item.amount &&
      typeof item.amount.amount === "number" &&
      item.amount.amount === 0
    ) {
      continue
    }

    if (item.status === "incomplete" || item.status === "abandoned") {
      continue
    }

    const startDate =
      toDate(item.createdAt) ??
      toDate(subscription.activeAt) ??
      toDate(subscription.createdAt) ??
      new Date()

    const currentPeriodStart = toDate(item.periodStart) ?? startDate

    if (item.planPeriod === "annual") {
      // Annual subscription covers 12 monthly grants for the paid year
      const startMonthIndex =
        currentPeriodStart.getUTCFullYear() * 12 +
        currentPeriodStart.getUTCMonth()

      for (let m = 0; m < 12; m++) {
        const total = startMonthIndex + m
        const year = Math.floor(total / 12)
        const month = (total % 12) + 1
        const yearMonth = `${year}-${String(month).padStart(2, "0")}`
        entryKeysToGrant.add(`sub:${subscription.id}:${yearMonth}`)
      }
    } else {
      // Monthly subscription: grant each paid month from startDate through current periodStart
      const startMonthIndex =
        startDate.getUTCFullYear() * 12 + startDate.getUTCMonth()
      const currentMonthIndex =
        currentPeriodStart.getUTCFullYear() * 12 +
        currentPeriodStart.getUTCMonth()

      const fromMonth = Math.min(startMonthIndex, currentMonthIndex)
      const toMonth = currentMonthIndex

      for (let m = fromMonth; m <= toMonth; m++) {
        const year = Math.floor(m / 12)
        const month = (m % 12) + 1
        const yearMonth = `${year}-${String(month).padStart(2, "0")}`
        entryKeysToGrant.add(`sub:${subscription.id}:${yearMonth}`)
      }
    }
  }

  // If subscription has no items but has active status (e.g. legacy/mocked), grant current month
  if (items.length === 0 && subscription.status === "active") {
    const now = new Date()
    const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
    entryKeysToGrant.add(`sub:${subscription.id}:${yearMonth}`)
  }

  if (entryKeysToGrant.size === 0) {
    return 0
  }

  // 3. Insert credit_ledger rows with ON CONFLICT DO NOTHING to ensure idempotency
  const rows = Array.from(entryKeysToGrant).map((entryKey) => ({
    orgId,
    entryKey,
    amount: SUBSCRIPTION_MONTHLY_CREDIT,
  }))

  try {
    const inserted = await db
      .insert(creditLedger)
      .values(rows)
      .onConflictDoNothing({
        target: [creditLedger.orgId, creditLedger.entryKey],
      })
      .returning({ id: creditLedger.id })

    if (inserted.length > 0) {
      Sentry.logger.info("Granted subscription credits to organization", {
        orgId,
        subscriptionId: subscription.id,
        monthsGranted: inserted.length,
      })
    }

    return inserted.length
  } catch (error) {
    Sentry.logger.error("Failed to insert reconciled credit ledger entries", {
      orgId,
      subscriptionId: subscription.id,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export { reconcileOrganizationSubscription as reconcile }
export { reconcileOrganizationSubscription as reconcileSubscription }
