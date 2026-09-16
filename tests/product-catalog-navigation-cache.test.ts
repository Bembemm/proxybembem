import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const REVALIDATION = new URL(
  "../lib/server/product-catalog-revalidation.ts",
  import.meta.url,
)
const PRODUCT_FORM = new URL(
  "../components/admin/products/product-form.tsx",
  import.meta.url,
)
const LIFECYCLE_ACTIONS = new URL(
  "../components/admin/products/product-lifecycle-actions.tsx",
  import.meta.url,
)
const NAVBAR = new URL("../components/navbar.tsx", import.meta.url)

test("public catalog revalidation is a Server Action covering home and products", () => {
  assert.equal(
    existsSync(REVALIDATION),
    true,
    "public product catalog revalidation Server Action must exist",
  )
  const source = readFileSync(REVALIDATION, "utf8")
  assert.match(source, /^["']use server["']/m)
  assert.match(source, /from\s+["']next\/cache["']/)
  assert.match(source, /revalidatePath\(\s*["']\/["']\s*\)/)
  assert.match(source, /revalidatePath\(\s*["']\/produtos["']\s*\)/)
})

test("successful admin product saves and lifecycle mutations invalidate client navigation cache", () => {
  const formSource = readFileSync(PRODUCT_FORM, "utf8")
  const lifecycleSource = readFileSync(LIFECYCLE_ACTIONS, "utf8")

  assert.match(formSource, /revalidatePublicProductCatalog/)
  assert.match(
    formSource,
    /const saved = payload\.product[\s\S]*await revalidatePublicProductCatalog\(\)/,
  )

  assert.match(lifecycleSource, /revalidatePublicProductCatalog/)
  assert.match(
    lifecycleSource,
    /!response\.ok[\s\S]*await revalidatePublicProductCatalog\(\)[\s\S]*onUpdated/,
  )
})

test("mutable storefront destinations bypass soft navigation that can reuse stale RSC payloads", () => {
  const source = readFileSync(NAVBAR, "utf8")

  assert.doesNotMatch(source, /label:\s*["']Início["']/)
  assert.match(
    source,
    /<a\s+[^>]*href=["']\/["'][^>]*aria-label=["']ProxyBembem - Início["'][^>]*>/,
  )
  assert.match(source, /href=\{`\/produtos\?categoria=\$\{encodeURIComponent\(category\)\}`\}/)
  assert.doesNotMatch(source, /<Link[\s\S]*\/produtos\?categoria=/)
})
