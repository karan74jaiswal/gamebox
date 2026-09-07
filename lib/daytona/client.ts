import { Daytona } from "@daytona/sdk"

if (!process.env.DAYTONA_API_KEY) throw new Error("DAYTONA_API_KEY not set")

export const daytona = new Daytona()
