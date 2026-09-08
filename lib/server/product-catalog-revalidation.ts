"use server"

import { revalidatePath } from "next/cache"
import { authorizeAdminAccess } from "./admin-auth.ts"

export async function revalidatePublicProductCatalog() {
  const admin = await authorizeAdminAccess({ touch: true })
  if (!admin.ok) throw new Error("Admin access denied")

  revalidatePath("/")
  revalidatePath("/produtos")
}
