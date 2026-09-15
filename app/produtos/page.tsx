import type { Metadata } from "next"
import { ProductsPage } from "@/components/pages/products-page"
import { listPublishedProducts } from "@/lib/server/product-catalog"
import { getPublicStoreSettings } from "@/lib/server/store-settings-cache"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Produtos",
  description: "Veja os decks, cartas avulsas e proxies disponíveis na ProxyBembem.",
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string | string[] }>
}) {
  const storeSettings = await getPublicStoreSettings()
  const params = await searchParams
  let products: Awaited<ReturnType<typeof listPublishedProducts>> = []
  let unavailable = false

  try {
    products = await listPublishedProducts()
  } catch {
    unavailable = true
  }

  const requestedCategory = firstSearchParam(params.categoria)?.trim().slice(0, 100)
  const initialCategory =
    requestedCategory && products.some((product) => product.category === requestedCategory)
      ? requestedCategory
      : undefined

  return (
    <ProductsPage
      products={products}
      unavailable={unavailable}
      productionLeadTimeBusinessDays={storeSettings.productionLeadTimeBusinessDays}
      initialCategory={initialCategory}
    />
  )
}
