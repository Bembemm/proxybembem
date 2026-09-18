import { getPublishedProductSummaries } from "@/lib/server/product-catalog-cache"

export async function GET() {
  try {
    const products = await getPublishedProductSummaries()
    return Response.json(
      { products },
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
