import { auth } from "@clerk/nextjs/server"
import { PricingTable } from "@clerk/nextjs"

export default async function BillingPage() {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  return (
    <div className="flex min-h-svh flex-col">
      {/* Top Header */}
      <header className="flex h-12 shrink-0 items-center border-b border-border/40 px-6">
        <span className="text-sm font-medium text-foreground">Billing</span>
      </header>

      {/* Main Content */}
      <div className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-3xl space-y-10">
          {/* Available credits */}
          <div>
            <p className="text-sm text-muted-foreground">Available credits</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              $8.80
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Credits cover the models that build and revise your games. A scene
              already in progress can finish below zero; the next build waits for
              more credits.
            </p>
          </div>

          {/* Subscription plans */}
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Keep the studio running
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Builder adds $10.00 every month, and unused credits roll over.
              </p>
            </div>

            <PricingTable for="organization" />
          </div>
        </div>
      </div>
    </div>
  )
}
