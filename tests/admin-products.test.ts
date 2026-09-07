import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import test from "node:test"

const formUrl = new URL("../lib/products/product-form.ts", import.meta.url)
const repositoryUrl = new URL("../lib/server/admin-products.ts", import.meta.url)
const FORM_IMPORT = "../lib/products/product-form.ts"
const REPOSITORY_IMPORT = "../lib/server/admin-products.ts"

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const
const EXPECTED_UPDATED_AT = "2026-09-07T20:00:00.000Z"
const NEXT_UPDATED_AT = "2026-09-07T20:01:00.000Z"

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

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Deck Proxy de Teste",
    category: "Decks",
    tag: "Novo",
    featured: false,
    imagePath: "products/11111111-1111-4111-8111-111111111111.webp",
    originalPriceCents: 12000,
    priceCents: 9990,
    description: "Descrição válida do produto",
    notice: "Aviso opcional",
    colors: ["Azul", "Preto"],
    highlights: ["100 cartas"],
    details: [{ label: "QUALIDADE", value: "Alta qualidade" }],
    sections: [{ title: "PRAZO", paragraphs: ["Até 5 dias úteis"] }],
    shipping: {
      weightKg: 0.5,
      lengthCm: 25,
      widthCm: 19,
      heightCm: 4,
    },
    displayOrder: 3,
    ...overrides,
  }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    status: "draft",
    title: "Deck Proxy de Teste",
    category: "Decks",
    tag: "Novo",
    featured: false,
    image_path: "products/11111111-1111-4111-8111-111111111111.webp",
    original_price_cents: 12000,
    price_cents: 9990,
    description: "Descrição válida do produto",
    notice: "Aviso opcional",
    colors: ["Azul", "Preto"],
    highlights: ["100 cartas"],
    details: [{ label: "QUALIDADE", value: "Alta qualidade" }],
    sections: [{ title: "PRAZO", paragraphs: ["Até 5 dias úteis"] }],
    shipping_weight_kg: 0.5,
    shipping_length_cm: 25,
    shipping_width_cm: 19,
    shipping_height_cm: 4,
    display_order: 3,
    created_at: "2026-09-07T19:59:00.000Z",
    updated_at: EXPECTED_UPDATED_AT,
    ...overrides,
  }
}

async function loadModules() {
  assert.equal(existsSync(formUrl), true, "product form validation module must exist")
  assert.equal(
    existsSync(repositoryUrl),
    true,
    "admin product mutation repository must exist",
  )

  const form = await import(FORM_IMPORT)
  const repository = await import(REPOSITORY_IMPORT)
  return { form, repository }
}

function parseBody(init?: RequestInit) {
  assert.equal(typeof init?.body, "string")
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

test("product form validation returns field-specific errors for empty and oversized content", async () => {
  const { form } = await loadModules()

  const result = form.validateProductMutationInput(
    validInput({
      title: "   ",
      category: "x".repeat(81),
      description: "",
      highlights: ["x".repeat(501)],
    }),
  )

  assert.equal(result.ok, false)
  assert.ok(result.fieldErrors.title)
  assert.ok(result.fieldErrors.category)
  assert.ok(result.fieldErrors.description)
  assert.ok(result.fieldErrors["highlights.0"])
})

test("product form validation rejects non-positive prices and shipping values", async () => {
  const { form } = await loadModules()

  const result = form.validateProductMutationInput(
    validInput({
      originalPriceCents: 0,
      priceCents: -1,
      shipping: {
        weightKg: 0,
        lengthCm: -1,
        widthCm: 0,
        heightCm: Number.NaN,
      },
    }),
  )

  assert.equal(result.ok, false)
  assert.ok(result.fieldErrors.originalPriceCents)
  assert.ok(result.fieldErrors.priceCents)
  assert.ok(result.fieldErrors["shipping.weightKg"])
  assert.ok(result.fieldErrors["shipping.lengthCm"])
  assert.ok(result.fieldErrors["shipping.widthCm"])
  assert.ok(result.fieldErrors["shipping.heightCm"])
})

test("creates new products as draft with validated server-owned storage fields", async (t) => {
  const { repository } = await loadModules()

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(url.origin, "https://example.supabase.co")
        assert.equal(url.pathname, "/rest/v1/products")
        assert.equal(init?.method, "POST")
        assert.equal((init?.headers as Record<string, string>)?.apikey, "server-secret")
        assert.match(
          (init?.headers as Record<string, string>)?.Prefer ?? "",
          /return=representation/,
        )

        const body = parseBody(init)
        assert.equal(body.status, "draft")
        assert.equal(body.title, "Deck Proxy de Teste")
        assert.equal(body.price_cents, 9990)
        assert.equal(body.shipping_weight_kg, 0.5)
        assert.equal("id" in body, false)
        assert.equal("updated_at" in body, false)

        return Response.json([row()])
      },
    )

    const product = await repository.createDraftProduct(validInput())
    assert.equal(product.id, 3)
    assert.equal(product.status, "draft")
    assert.equal(product.discountPrice, 99.9)
  })
})

test("updates product fields with id plus updated_at compare-and-swap and preserves lifecycle state", async (t) => {
  const { repository } = await loadModules()

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(init?.method, "PATCH")
        assert.equal(url.searchParams.get("id"), "eq.3")
        assert.equal(url.searchParams.get("updated_at"), `eq.${EXPECTED_UPDATED_AT}`)

        const body = parseBody(init)
        assert.equal(body.title, "Título atualizado")
        assert.equal("status" in body, false)
        assert.equal("id" in body, false)
        assert.equal("updated_at" in body, false)

        return Response.json([
          row({ title: "Título atualizado", updated_at: NEXT_UPDATED_AT }),
        ])
      },
    )

    const product = await repository.updateProduct(
      3,
      EXPECTED_UPDATED_AT,
      validInput({ title: "Título atualizado" }),
    )
    assert.equal(product.title, "Título atualizado")
    assert.equal(product.status, "draft")
    assert.equal(product.updatedAt, NEXT_UPDATED_AT)
  })
})

test("publishes only through an explicit draft-to-published lifecycle mutation", async (t) => {
  const { repository } = await loadModules()

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(init?.method, "PATCH")
        assert.equal(url.searchParams.get("id"), "eq.3")
        assert.equal(url.searchParams.get("updated_at"), `eq.${EXPECTED_UPDATED_AT}`)
        assert.equal(url.searchParams.get("status"), "eq.draft")
        assert.deepEqual(parseBody(init), { status: "published" })
        return Response.json([
          row({ status: "published", updated_at: NEXT_UPDATED_AT }),
        ])
      },
    )

    const product = await repository.publishProduct(3, EXPECTED_UPDATED_AT)
    assert.equal(product.status, "published")
  })
})

test("archives by update without physical delete", async (t) => {
  const { repository } = await loadModules()

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(init?.method, "PATCH")
        assert.notEqual(init?.method, "DELETE")
        assert.equal(url.searchParams.get("id"), "eq.3")
        assert.equal(url.searchParams.get("updated_at"), `eq.${EXPECTED_UPDATED_AT}`)
        assert.deepEqual(parseBody(init), { status: "archived" })
        return Response.json([
          row({ status: "archived", updated_at: NEXT_UPDATED_AT }),
        ])
      },
    )

    const product = await repository.archiveProduct(3, EXPECTED_UPDATED_AT)
    assert.equal(product.status, "archived")
  })
})

test("reactivates archived products to draft rather than publishing automatically", async (t) => {
  const { repository } = await loadModules()

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(init?.method, "PATCH")
        assert.equal(url.searchParams.get("status"), "eq.archived")
        assert.deepEqual(parseBody(init), { status: "draft" })
        return Response.json([row({ updated_at: NEXT_UPDATED_AT })])
      },
    )

    const product = await repository.reactivateProduct(3, EXPECTED_UPDATED_AT)
    assert.equal(product.status, "draft")
  })
})

test("rejects stale saves with ProductConflictError instead of overwriting newer data", async (t) => {
  const { repository } = await loadModules()
  let calls = 0

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        calls += 1
        const url = new URL(String(input))

        if (init?.method === "PATCH") {
          assert.equal(url.searchParams.get("updated_at"), `eq.${EXPECTED_UPDATED_AT}`)
          return Response.json([])
        }

        assert.equal(init?.method, undefined)
        assert.equal(url.searchParams.get("id"), "eq.3")
        return Response.json([row({ updated_at: NEXT_UPDATED_AT })])
      },
    )

    await assert.rejects(
      () => repository.updateProduct(3, EXPECTED_UPDATED_AT, validInput()),
      (error: unknown) => error instanceof repository.ProductConflictError,
    )
    assert.equal(calls, 2)
  })
})

test("rejects an invalid direct publish of an archived product", async (t) => {
  const { repository } = await loadModules()

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        if (init?.method === "PATCH") return Response.json([])
        assert.equal(url.searchParams.get("id"), "eq.3")
        return Response.json([row({ status: "archived" })])
      },
    )

    await assert.rejects(
      () => repository.publishProduct(3, EXPECTED_UPDATED_AT),
      /invalid product lifecycle transition/i,
    )
  })
})
