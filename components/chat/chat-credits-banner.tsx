"use client"

import * as React from "react"
import Link from "next/link"
import { AlertCircle } from "lucide-react"

export interface ChatCreditsBannerProps {
  isOutOfCredits: boolean
}

export function ChatCreditsBanner({ isOutOfCredits }: ChatCreditsBannerProps) {
  if (!isOutOfCredits) return null

  return (
    <div className="mb-3 rounded-2xl border border-white/10 bg-zinc-900/90 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-white/80" />
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-white">Out of credits</h4>
          <p className="text-xs leading-relaxed text-zinc-400">
            Building a game spends credits, and this organization has none left.{" "}
            <Link
              href="/billing"
              className="font-medium text-zinc-200 underline underline-offset-4 hover:text-white"
            >
              Add more from the billing page
            </Link>{" "}
            to pick this game back up.
          </p>
        </div>
      </div>
    </div>
  )
}
