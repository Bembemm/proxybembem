import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import test from "node:test"

const productDomainUrl = new URL("../lib/products/product.ts", import.meta.url)
const repositoryUrl = new URL("../lib/server/product-catalog.ts", import.meta.url)
const PRODUCT_DOMAIN_IMPORT = "../lib/products/product.ts"
const PRODUCT_REPOSITORY_IMPORT = "../lib/server/product-catalog.ts"

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const

async function withSupabaseEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "server-secret"

  try {
    await run()
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    status: "published",
    title: "Deck Commander Proxy 100 Cartas",
    category: "Decks",
    tag: "Mais Vendido",
    featured: true,
    image_path: "/products/deck-commander.png",
    original_price_cents: 15000,
    price_cents: 11990,
    description: "Descrição do produto",
    notice: "Informações importantes",
    colors: ["Azul", "Preto"],
    highlights: ["100 cartas"],
    details: [{ label: "QUALIDADE", value: "Alta qualidade" }],
    sections: [{ title: "PRAZO", paragraphs: ["Até 5 dias úteis"] }],
    shipping_weight_kg: 0.5,
    shipping_length_cm: 25,
    shipping_width_cm: 19,
    shipping_height_cm: 4,
    display_order: 1,
    created_at: "2026-09-07T18:00:00.000Z",
    updated_at: "2026-09-07T18:01:00.000Z",
    ...overrides,
  }
}

async function loadModules() {
  assert.equal(existsSync(productDomainUrl), true, "shared product domain must exist")
  assert.equal(existsSync(repositoryUrl), true, "product catalog repository must exist")

  const domain = await import(PRODUCT_DOMAIN_IMPORT)
  const repository = await import(PRODUCT_REPOSITORY_IMPORT)
  return { domain, repository }
}

test("published catalog maps database cents and shipping into the current Product shape", async (t) => {
  const { repository } = await loadModules()

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(url.origin, "https://example.supabase.co")
        assert.equal(url.pathname, "/rest/v1/products")
        assert.equal(url.searchParams.get("status"), "eq.published")
        assert.equal(url.searchParams.get("order"), "display_order.asc,id.asc")
        assert.equal((init?.headers as Record<string, string>)?.apikey, "server-secret")
        assert.equal(init?.cache, "no-store")
        return Response.json([row()])
      },
    )

    const products = await repository.listPublishedProducts()
    assert.equal(products.length, 1)
    assert.deepEqual(products[0], {
      id: 1,
      status: "published",
      title: "Deck Commander Proxy 100 Cartas",
      image: "/products/deck-commander.png",
      imagePath: "/products/deck-commander.png",
      originalPrice: 150,
      discountPrice: 119.9,
      tag: "Mais Vendido",
      category: "Decks",
      colors: ["Azul", "Preto"],
      featured: true,
      notice: "Informações importantes",
      highlights: ["100 cartas"],
      description: "Descrição do produto",
      details: [{ label: "QUALIDADE", value: "Alta qualidade" }],
      sections: [{ title: "PRAZO", paragraphs: ["Até 5 dias úteis"] }],
      shipping: { weightKg: 0.5, lengthCm: 25, widthCm: 19, heightCm: 4 },
      displayOrder: 1,
      createdAt: "2026-09-07T18:00:00.000Z",
      updatedAt: "2026-09-07T18:01:00.000Z",
    })
  })
})

test("storage image paths become public bucket URLs while legacy local images stay local", async () => {
  const { domain } = await loadModules()

  const stored = domain.parseProductRow(
    row({ image_path: "products/11111111-1111-4111-8111-111111111111.webp" }),
    "https://example.supabase.co",
  )
  assert.equal(
    stored.image,
    "https://example.supabase.co/storage/v1/object/public/product-images/products/11111111-1111-4111-8111-111111111111.webp",
  )

  const legacy = domain.parseProductRow(row(), "https://example.supabase.co")
  assert.equal(legacy.image, "/products/deck-commander.png")
})

test("public catalog rejects malformed database rows instead of coercing them", async (t) => {
  const { repository } = await loadModules()

  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json([row({ price_cents: -1 })]),
    )

    await assert.rejects(
      () => repository.listPublishedProducts(),
      /invalid product catalog response/i,
    )
  })
})

test("published id lookup filters storage to published products and preserves requested ids", async (t) => {
  const { repository } = await loadModules()

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0]) => {
        const url = new URL(String(input))
        assert.equal(url.searchParams.get("status"), "eq.published")
        assert.equal(url.searchParams.get("id"), "in.(1,2)")
        return Response.json([
          row(),
          row({ id: 2, title: "Deck Proxy 60 Cartas", display_order: 2 }),
        ])
      },
    )

    const products = await repository.getPublishedProductsByIds([2, 1, 2])
    assert.deepEqual(products.map((product: { id: number }) => product.id), [1, 2])
  })
})

test("admin catalog can list all lifecycle states with bounded search and pagination", async (t) => {
  const { repository } = await loadModules()

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(url.searchParams.get("status"), "eq.archived")
        assert.equal(url.searchParams.get("title"), "ilike.*Deck*")
        assert.equal(url.searchParams.get("limit"), "10")
        assert.equal(url.searchParams.get("offset"), "10")
        assert.equal((init?.headers as Record<string, string>)?.Prefer, "count=exact")
        return new Response(
          JSON.stringify([row({ status: "archived" })]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Content-Range": "10-10/11",
            },
          },
        )
      },
    )

    const result = await repository.listAdminProducts({
      query: " Deck ",
      status: "archived",
      page: 2,
      pageSize: 10,
    })
    assert.equal(result.products[0]?.status, "archived")
    assert.equal(result.total, 11)
    assert.equal(result.page, 2)
    assert.equal(result.pageSize, 10)
  })
})

test("admin product lookup returns null only for a missing valid id", async (t) => {
  const { repository } = await loadModules()

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0]) => {
        const url = new URL(String(input))
        assert.equal(url.searchParams.get("id"), "eq.99")
        return Response.json([])
      },
    )

    assert.equal(await repository.getAdminProduct(99), null)
    await assert.rejects(() => repository.getAdminProduct(0), /invalid product id/i)
  })
})
