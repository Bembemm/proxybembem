"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { authorizeAdminAccess } from "./admin-auth.ts"

export async function revalidatePublicProductCatalog() {
  const admin = await authorizeAdminAccess({ touch: true })
  if (!admin.ok) throw new Error("Admin access denied")

  revalidateTag("product-catalog", { expire: 0 })
  revalidatePath("/")
  revalidatePath("/produtos")
}
