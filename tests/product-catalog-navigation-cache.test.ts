import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import { createAdminProductRouteHandlers } from "../lib/server/admin-product-actions.ts"

const REVISION = "2026-09-08T12:00:00.000Z"
const REVALIDATION = new URL(
  "../lib/server/product-catalog-revalidation.ts",
  import.meta.url,
)

function storedProduct(status: "draft" | "published" | "archived" = "archived") {
  return {
    id: 3,
    status,
    title: "Produto de teste",
    category: "Decks",
    tag: null,
    featured: false,
    image: "/placeholder-logo.png",
    imagePath: "/placeholder-logo.png",
    originalPrice: 35,
    discountPrice: 35,
    description: "Produto para regressão de cache",
    colors: [],
    highlights: [],
    details: [],
    sections: [],
    shipping: { weightKg: 0.1, lengthCm: 20, widthCm: 15, heightCm: 2 },
    displayOrder: 0,
    createdAt: "2026-09-08T11:00:00.000Z",
    updatedAt: "2026-09-08T12:01:00.000Z",
  }
}

function allowedRequest(path: string) {
  return new Request(`https://shop.test${path}`, {
    method: "POST",
    headers: {
      Origin: "https://shop.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expectedUpdatedAt: REVISION }),
  })
}

test("successful product archive invalidates the public storefront cache", async () => {
  let invalidations = 0
  const deps = {
    authorizeAdmin: async () => ({
      ok: true as const,
      principal: {
        userId: "11111111-1111-4111-8111-111111111111",
        authSessionId: "22222222-2222-4222-8222-222222222222",
        aal: "aal2" as const,
      },
    }),
    createDraftProduct: async () => storedProduct("draft"),
    updateProduct: async () => storedProduct("draft"),
    publishProduct: async () => storedProduct("published"),
    archiveProduct: async () => storedProduct("archived"),
    reactivateProduct: async () => storedProduct("draft"),
    invalidatePublicCatalog: () => {
      invalidations += 1
    },
  }
  const handlers = createAdminProductRouteHandlers(deps)

  const env = process.env as Record<string, string | undefined>
  const previousNodeEnv = env.NODE_ENV
  const previousSiteUrl = env.NEXT_PUBLIC_SITE_URL
  env.NODE_ENV = "development"
  delete env.NEXT_PUBLIC_SITE_URL

  try {
    const response = await handlers.archive(
      allowedRequest("/api/admin/products/3/archive"),
      { params: Promise.resolve({ id: "3" }) },
    )
    assert.equal(response.status, 200)
    assert.equal(invalidations, 1)
  } finally {
    if (previousNodeEnv === undefined) delete env.NODE_ENV
    else env.NODE_ENV = previousNodeEnv
    if (previousSiteUrl === undefined) delete env.NEXT_PUBLIC_SITE_URL
    else env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
  }
})

test("public catalog revalidation covers home and products pages", () => {
  assert.equal(
    existsSync(REVALIDATION),
    true,
    "public product catalog revalidation helper must exist",
  )
  const source = readFileSync(REVALIDATION, "utf8")
  assert.match(source, /revalidatePath\(\s*["']\/["']\s*\)/)
  assert.match(source, /revalidatePath\(\s*["']\/produtos["']\s*\)/)
})
