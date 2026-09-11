"use server"

import { revalidatePath } from "next/cache"

import { requireCustomerPageAccess } from "@/lib/server/customer-auth"

export async function refreshCustomerAccountViews() {
  await requireCustomerPageAccess()
  revalidatePath("/minha-conta", "layout")
}
