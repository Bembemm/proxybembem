import { revalidatePath, revalidateTag } from "next/cache"

export function invalidatePublicProductCatalog() {
  revalidateTag("product-catalog", { expire: 0 })
  revalidatePath("/")
  revalidatePath("/produtos")
  revalidatePath("/produtos/[produto]", "page")
}
