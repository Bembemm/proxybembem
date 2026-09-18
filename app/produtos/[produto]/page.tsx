import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { ProductPage } from "@/components/product-page"
import { productHref, productIdFromRouteSegment } from "@/lib/products/product-url"
import {
  getPublishedProductsByIds,
  listPublishedProducts,
} from "@/lib/server/product-catalog"
import { getPublicStoreSettings } from "@/lib/server/store-settings-cache"

export const dynamic = "force-dynamic"

async function getProductFromSegment(segment: string) {
  const productId = productIdFromRouteSegment(segment)
  if (!productId) return null

  const products = await getPublishedProductsByIds([productId])
  return products[0] ?? null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ produto: string }>
}): Promise<Metadata> {
  const { produto } = await params

  try {
    const product = await getProductFromSegment(produto)
    if (!product) {
      return {
        title: "Produto não encontrado",
        robots: { index: false, follow: false },
      }
    }

    return {
      title: product.title,
      description: product.description.slice(0, 160),
      alternates: { canonical: productHref(product) },
    }
  } catch {
    return {
      title: "Produto",
      robots: { index: false, follow: false },
    }
  }
}

export default async function ProductRoute({
  params,
}: {
  params: Promise<{ produto: string }>
}) {
  const { produto } = await params
  const productId = productIdFromRouteSegment(produto)
  if (!productId) notFound()

  const [selectedProducts, products, storeSettings] = await Promise.all([
    getPublishedProductsByIds([productId]),
    listPublishedProducts(),
    getPublicStoreSettings(),
  ])

  const product = selectedProducts[0]
  if (!product) notFound()

  const canonicalPath = productHref(product)
  if ("/produtos/" + produto !== canonicalPath) {
    redirect(canonicalPath)
  }

  const sameCategory = products.filter(
    (candidate) => candidate.id !== product.id && candidate.category === product.category,
  )
  const fallback = products.filter(
    (candidate) =>
      candidate.id !== product.id &&
      !sameCategory.some((related) => related.id === candidate.id),
  )
  const relatedProducts = [...sameCategory, ...fallback].slice(0, 4)

  return (
    <ProductPage
      product={product}
      relatedProducts={relatedProducts}
      productionLeadTimeBusinessDays={storeSettings.productionLeadTimeBusinessDays}
    />
  )
}
