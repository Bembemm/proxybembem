import { revalidateTag, unstable_cache } from "next/cache"
import { readPublicStoreSettings } from "./store-settings.ts"

const getCachedPublicStoreSettings = unstable_cache(
  readPublicStoreSettings,
  ["public-store-settings"],
  {
    revalidate: 300,
    tags: ["store-settings"],
  },
)

export async function getPublicStoreSettings() {
  return getCachedPublicStoreSettings()
}

export function invalidatePublicStoreSettings() {
  revalidateTag("store-settings", { expire: 0 })
}
