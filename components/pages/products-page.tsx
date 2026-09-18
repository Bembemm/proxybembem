import { ProductsBrowser, type ProductBrowserEntry } from "@/components/products-browser"
import { StorefrontProductCard } from "@/components/storefront-product-card"
import type { StorefrontProduct } from "@/contexts/cart-context"

export function ProductsPage({
  products,
  unavailable = false,
  initialCategory,
  initialSearch,
}: {
  products: StorefrontProduct[]
  unavailable?: boolean
  initialCategory?: string
  initialSearch?: string
}) {
  const entries: ProductBrowserEntry[] = products.map((product) => ({
    id: product.id,
    title: product.title,
    category: product.category,
    card: <StorefrontProductCard product={product} />,
  }))

  return (
    <ProductsBrowser
      entries={entries}
      unavailable={unavailable}
      initialCategory={initialCategory}
      initialSearch={initialSearch}
    />
  )
}
