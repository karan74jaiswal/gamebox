import { desc, eq, sql } from "drizzle-orm"
import * as Sentry from "@sentry/nextjs"

import { db, creditLedger, type CreditLedgerEntry } from "@/lib/db"
import { formatDollars } from "./format"

// 1 dollar = 1,000,000,000 billionths of a dollar (nano-dollars)
export const BILLIONTHS_PER_DOLLAR = BigInt("1000000000")

// Every organization gets $1.00 of free credit that isn't stored as a row
export const FREE_CREDIT_AMOUNT = BigInt("1000000000") // $1.00 in billionths

/**
 * Calculates the current credit balance for an organization in billionths of a dollar.
 * Balance = sum of an org's credit_ledger rows + $1.00 free credit.
 * An organization with no rows in the table returns exactly $1.00 (1_000_000_000n).
 */
export async function getOrgBalance(orgId: string): Promise<bigint> {
  if (!orgId) {
    return FREE_CREDIT_AMOUNT
  }

  try {
    const [result] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${creditLedger.amount}), 0)`,
      })
      .from(creditLedger)
      .where(eq(creditLedger.orgId, orgId))

    const sumAmount = BigInt(result?.total ?? "0")
    return sumAmount + FREE_CREDIT_AMOUNT
  } catch (error) {
    Sentry.logger.error("Failed to calculate organization credit balance", {
      orgId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Convenience helper to return the organization's credit balance as a formatted dollar string.
 * An organization with no rows reads exactly "$1.00".
 */
export async function getFormattedOrgBalance(orgId: string): Promise<string> {
  const balance = await getOrgBalance(orgId)
  return formatDollars(balance)
}

/**
 * Returns recent credit ledger entries for an organization.
 */
export async function getOrgLedgerEntries(
  orgId: string,
  limit = 50
): Promise<CreditLedgerEntry[]> {
  if (!orgId) {
    return []
  }

  try {
    return await db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.orgId, orgId))
      .orderBy(desc(creditLedger.createdAt))
      .limit(limit)
  } catch (error) {
    Sentry.logger.error("Failed to query organization credit ledger entries", {
      orgId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export interface ChargeStepParams {
  orgId: string
  stepResponseId: string
  amount: bigint | number
}

/**
 * Charges an organization for an AI generation step.
 * - Inserts a negative credit_ledger row for that amount in billionths of a dollar (nano-dollars).
 * - Uses the step's response id as the entry key, so the same step can never be charged twice.
 * - If amount is passed as a positive number or bigint, it is negated before insertion.
 */
export async function chargeStep(
  params: ChargeStepParams
): Promise<CreditLedgerEntry | null>
export async function chargeStep(
  orgId: string,
  stepResponseId: string,
  amount: bigint | number
): Promise<CreditLedgerEntry | null>
export async function chargeStep(
  paramOrOrgId: ChargeStepParams | string,
  maybeStepResponseId?: string,
  maybeAmount?: bigint | number
): Promise<CreditLedgerEntry | null> {
  let orgId: string
  let stepResponseId: string
  let rawAmount: bigint | number

  if (typeof paramOrOrgId === "object" && paramOrOrgId !== null) {
    orgId = paramOrOrgId.orgId
    stepResponseId = paramOrOrgId.stepResponseId
    rawAmount = paramOrOrgId.amount
  } else {
    orgId = paramOrOrgId
    stepResponseId = maybeStepResponseId!
    rawAmount = maybeAmount!
  }

  if (!orgId || !stepResponseId) {
    Sentry.logger.warn(
      "Skipping chargeStep due to missing orgId or stepResponseId",
      {
        orgId,
        stepResponseId,
      }
    )
    return null
  }

  const nanoAmount =
    typeof rawAmount === "number" ? BigInt(Math.round(rawAmount)) : rawAmount

  // Negative amount for charges
  const negativeAmount =
    nanoAmount > BigInt(0) ? -nanoAmount : nanoAmount

  try {
    const [inserted] = await db
      .insert(creditLedger)
      .values({
        orgId,
        entryKey: stepResponseId,
        amount: negativeAmount,
      })
      .onConflictDoNothing({
        target: [creditLedger.orgId, creditLedger.entryKey],
      })
      .returning()

    if (inserted) {
      Sentry.logger.info("Successfully charged step to credit ledger", {
        orgId,
        stepResponseId,
        amount: negativeAmount.toString(),
      })
    } else {
      Sentry.logger.info("Step already charged, skipped duplicate entry", {
        orgId,
        stepResponseId,
      })
    }

    return inserted ?? null
  } catch (error) {
    Sentry.logger.error("Failed to charge step to credit ledger", {
      orgId,
      stepResponseId,
      amount: negativeAmount.toString(),
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
