import type { CatalogProduct, Product } from "@/lib/products/product"
import { listPublishedProducts } from "@/lib/server/product-catalog"

function toPublicProduct(product: CatalogProduct): Product {
  return {
    id: product.id,
    title: product.title,
    image: product.image,
    originalPrice: product.originalPrice,
    discountPrice: product.discountPrice,
    tag: product.tag,
    category: product.category,
    colors: product.colors,
    featured: product.featured,
    ...(product.notice === undefined ? {} : { notice: product.notice }),
    highlights: product.highlights,
    description: product.description,
    details: product.details,
    sections: product.sections,
    shipping: product.shipping,
  }
}

export async function GET() {
  try {
    const products = await listPublishedProducts()
    return Response.json(
      { products: products.map(toPublicProduct) },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return Response.json(
      { error: "catalog_unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    )
  }
}
