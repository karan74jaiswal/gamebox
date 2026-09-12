"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

export interface BillingCreditsSyncProps {
  credits: string
}

/**
 * Synchronizes newly reconciled credit balances with the client UI and the Next.js layout cache.
 * - Broadcasts a "credits-updated" DOM event to immediately update client components (such as the sidebar) with 0ms latency.
 * - Calls router.refresh() in the background to re-validate the parent layout cache on the server.
 */
export function BillingCreditsSync({ credits }: BillingCreditsSyncProps) {
  const router = useRouter()
  const lastSyncedRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (lastSyncedRef.current === credits) return
    lastSyncedRef.current = credits

    window.dispatchEvent(
      new CustomEvent("credits-updated", { detail: { credits } })
    )

    router.refresh()
  }, [credits, router])

  return null
}
