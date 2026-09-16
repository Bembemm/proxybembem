import { HomePage } from "@/components/pages/home-page"
import { listPublishedProducts } from "@/lib/server/product-catalog"
import { getPublicStoreSettings } from "@/lib/server/store-settings-cache"

export const dynamic = "force-dynamic"

export default async function Home() {
  const storeSettings = await getPublicStoreSettings()
  let products: Awaited<ReturnType<typeof listPublishedProducts>> = []
  let unavailable = false

  try {
    products = await listPublishedProducts()
  } catch {
    unavailable = true
  }

  return (
    <HomePage
      products={products}
      unavailable={unavailable}
      productionLeadTimeBusinessDays={storeSettings.productionLeadTimeBusinessDays}
    />
  )
}
