import type { Metadata } from "next"
import { ProductsPage } from "@/components/pages/products-page"
import { listPublishedProducts } from "@/lib/server/product-catalog"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Produtos",
  description: "Veja os decks, cartas avulsas e proxies disponíveis na ProxyBembem.",
}

export default async function ProdutosPage() {
  let products: Awaited<ReturnType<typeof listPublishedProducts>> = []
  let unavailable = false

  try {
    products = await listPublishedProducts()
  } catch {
    unavailable = true
  }

  return <ProductsPage products={products} unavailable={unavailable} />
}
