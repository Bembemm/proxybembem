import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("product images use Next optimization instead of bypassing it", async () => {
  await access(new URL("../public/products/deck-commander.png", import.meta.url))

  const files = [
    "../components/home-highlight-product-card.tsx",
    "../components/storefront-product-card.tsx",
    "../components/product-page.tsx",
    "../components/cart-items.tsx",
    "../components/checkout-page.tsx",
    "../components/navbar.tsx",
  ]

  for (const path of files) {
    const text = await source(path)
    assert.match(text, /<Image\b/, `${path} must render product images with next/image`)
    assert.doesNotMatch(
      text,
      /unoptimized=\{(?:item\.)?product\.image\.startsWith\(["']\/["']\)\}/,
      `${path} must not bypass Next image optimization`,
    )
  }

  const config = await source("../next.config.mjs")
  assert.match(config, /minimumCacheTTL:\s*86_400/)
  assert.match(config, /\/storage\/v1\/object\/public\/product-images\/\*\*/)
})

test("storefront explicitly opts out of browser forced dark color schemes", async () => {
  const [layout, globals] = await Promise.all([
    source("../app/layout.tsx"),
    source("../app/globals.css"),
  ])

  assert.match(layout, /colorScheme:\s*["']light["']/)
  assert.match(globals, /color-scheme:\s*only light/)
})
