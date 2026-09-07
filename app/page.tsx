import { HomePage } from "@/components/pages/home-page"
import { listPublishedProducts } from "@/lib/server/product-catalog"

export default async function Home() {
  let products: Awaited<ReturnType<typeof listPublishedProducts>> = []
  let unavailable = false

  try {
    products = await listPublishedProducts()
  } catch {
    unavailable = true
  }

  const featuredProducts = products.filter((product) => product.featured === true)

  return <HomePage featuredProducts={featuredProducts} unavailable={unavailable} />
}
