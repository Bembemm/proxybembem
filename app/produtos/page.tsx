import type { Metadata } from "next"
import { ProductsPage } from "@/components/pages/products-page"
import { getPublishedProductSummaries } from "@/lib/server/product-catalog-cache"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Produtos",
  description: "Veja os decks, cartas avulsas e proxies disponíveis na ProxyBembem.",
  alternates: {
    canonical: "/produtos",
  },
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{
    categoria?: string | string[]
    busca?: string | string[]
  }>
}) {
  const params = await searchParams
  let products: Awaited<ReturnType<typeof getPublishedProductSummaries>> = []
  let unavailable = false

  try {
    products = await getPublishedProductSummaries()
  } catch {
    unavailable = true
  }

  const requestedCategory = firstSearchParam(params.categoria)?.trim().slice(0, 100)
  const initialCategory =
    requestedCategory && products.some((product) => product.category === requestedCategory)
      ? requestedCategory
      : undefined
  const requestedSearch = firstSearchParam(params.busca)?.trim().slice(0, 100)
  const initialSearch = requestedSearch || undefined

  return (
    <ProductsPage
      key={`${initialCategory ?? "all-products"}:${initialSearch ?? "all-search"}`}
      products={products}
      unavailable={unavailable}
      initialCategory={initialCategory}
      initialSearch={initialSearch}
    />
  )
}
