import Image from "next/image"
import Link from "next/link"
import { Home } from "lucide-react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-4">
      <Empty className="max-w-md flex-none border-0">
        <EmptyHeader>
          <EmptyMedia>
            <Image src="/logo.svg" alt="Gamebox" width={48} height={48} />
          </EmptyMedia>
          <EmptyTitle className="text-2xl font-bold tracking-tight">
            Game not found
          </EmptyTitle>
          <EmptyDescription className="text-base text-muted-foreground">
            The game you are looking for doesn&apos;t exist, has been removed,
            or is no longer accessible.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="mt-2 flex flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "default", size: "default" }),
              "gap-2 rounded-lg"
            )}
          >
            <Home className="size-4" />
            <span>Back to Home</span>
          </Link>
        </EmptyContent>
      </Empty>
    </main>
  )
}
