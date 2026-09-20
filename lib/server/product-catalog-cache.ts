import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"
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


export function invalidatePublishedProductCatalog() {
  revalidateTag("product-catalog", { expire: 0 })
  revalidatePath("/")
  revalidatePath("/produtos")
  revalidatePath("/produtos/[produto]", "page")
}
