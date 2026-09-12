/**
 * Formats an amount in billionths of a dollar (nano-dollars) as a USD currency string.
 * e.g. 1_000_000_000n -> "$1.00", 8_800_000_000n -> "$8.80", 0n -> "$0.00"
 */
export function formatDollars(amount: bigint | number): string {
  const raw = typeof amount === "bigint" ? Number(amount) : amount
  const dollars = raw / 1e9

  // Guard against -$0.00 when rounding near zero
  const normalized = Math.abs(dollars) < 0.005 ? 0 : dollars

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalized)
}

export { formatDollars as formatAmount }
export { formatDollars as formatCredits }
