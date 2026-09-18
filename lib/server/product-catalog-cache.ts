import { unstable_cache } from "next/cache"
import { listPublishedProductSummaries } from "./product-catalog"

const getCachedPublishedProductSummaries = unstable_cache(
  listPublishedProductSummaries,
  ["published-product-summaries"],
  {
    revalidate: 60,
    tags: ["product-catalog"],
  },
)

export async function getPublishedProductSummaries() {
  return getCachedPublishedProductSummaries()
}
