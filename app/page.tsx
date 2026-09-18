import type { Metadata } from "next"
import { HomePage } from "@/components/pages/home-page"
import { getPublishedProductSummaries } from "@/lib/server/product-catalog-cache"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
}

export default async function Home() {
  let products: Awaited<ReturnType<typeof getPublishedProductSummaries>> = []
  let unavailable = false

  try {
    products = await getPublishedProductSummaries()
  } catch {
    unavailable = true
  }

  return <HomePage products={products} unavailable={unavailable} />
}
