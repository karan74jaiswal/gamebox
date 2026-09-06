import { auth } from "@clerk/nextjs/server"

interface GamePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function GamePage({ params }: GamePageProps) {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  const { id } = await params

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6">
      <p>{id}</p>
    </div>
  )
}
