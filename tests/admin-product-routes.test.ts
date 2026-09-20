import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import { ProductConflictError } from "../lib/server/admin-products.ts"

const actionsUrl = new URL("../lib/server/admin-product-actions.ts", import.meta.url)
const ACTIONS_IMPORT = "../lib/server/admin-product-actions.ts"
const ROUTES = [
  ["../app/api/admin/products/route.ts", "create"],
  ["../app/api/admin/products/[id]/route.ts", "update"],
  ["../app/api/admin/products/[id]/publish/route.ts", "publish"],
  ["../app/api/admin/products/[id]/archive/route.ts", "archive"],
  ["../app/api/admin/products/[id]/reactivate/route.ts", "reactivate"],
] as const

const ADMIN_ID = "11111111-1111-4111-8111-111111111111"
const SESSION_ID = "22222222-2222-4222-8222-222222222222"
const REVISION = "2026-09-07T20:00:00.000Z"

function validProduct(overrides: Record<string, unknown> = {}) {
  return {
    title: "Deck Proxy de Teste",
    category: "Decks",
    tag: "Novo",
    featured: false,
    imagePath: "products/33333333-3333-4333-8333-333333333333.webp",
    originalPriceCents: 12000,
    priceCents: 9990,
    description: "Descrição válida do produto",
    notice: null,
    colors: ["Azul"],
    highlights: ["100 cartas"],
    details: [{ label: "QUALIDADE", value: "Alta qualidade" }],
    sections: [{ title: "PRAZO", paragraphs: ["Até 5 dias úteis"] }],
    shipping: { weightKg: 0.5, lengthCm: 25, widthCm: 19, heightCm: 4 },
    displayOrder: 3,
    ...overrides,
  }
}

function storedProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    status: "draft",
    title: "Deck Proxy de Teste",
    category: "Decks",
    tag: "Novo",
    featured: false,
    image: "https://example.supabase.co/storage/v1/object/public/product-images/products/test.webp",
    imagePath: "products/test.webp",
    originalPrice: 120,
    discountPrice: 99.9,
    description: "Descrição válida do produto",
    notice: null,
    colors: ["Azul"],
    highlights: ["100 cartas"],
    details: [{ label: "QUALIDADE", value: "Alta qualidade" }],
    sections: [{ title: "PRAZO", paragraphs: ["Até 5 dias úteis"] }],
    shipping: { weightKg: 0.5, lengthCm: 25, widthCm: 19, heightCm: 4 },
    displayOrder: 3,
    createdAt: "2026-09-07T19:00:00.000Z",
    updatedAt: "2026-09-07T20:01:00.000Z",
    ...overrides,
  }
}

function allowedRequest(path: string, init: RequestInit = {}) {
  return new Request(`https://shop.test${path}`, {
    ...init,
    headers: {
      Origin: "https://shop.test",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
}

function context(id = "3") {
  return { params: Promise.resolve({ id }) }
}

function authorized() {
  return {
    ok: true as const,
    principal: {
      userId: ADMIN_ID,
      authSessionId: SESSION_ID,
      aal: "aal2" as const,
    },
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorizeAdmin: async () => authorized(),
    createDraftProduct: async () => storedProduct(),
    updateProduct: async () => storedProduct(),
    publishProduct: async () => storedProduct({ status: "published" }),
    archiveProduct: async () => storedProduct({ status: "archived" }),
    reactivateProduct: async () => storedProduct({ status: "draft" }),
    invalidatePublicProductCatalog: async () => {},
    ...overrides,
  }
}

async function loadActions() {
  assert.equal(existsSync(actionsUrl), true, "admin product route action module must exist")
  for (const [relativePath] of ROUTES) {
    assert.equal(
      existsSync(new URL(relativePath, import.meta.url)),
      true,
      `${relativePath} must exist`,
    )
  }
  return import(ACTIONS_IMPORT)
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

async function withRouteEnv(run: () => Promise<void>) {
  const env = process.env as Record<string, string | undefined>
  const previousNodeEnv = env.NODE_ENV
  const previousSiteUrl = env.NEXT_PUBLIC_SITE_URL
  env.NODE_ENV = "development"
  delete env.NEXT_PUBLIC_SITE_URL
  try {
    await run()
  } finally {
    if (previousNodeEnv === undefined) delete env.NODE_ENV
    else env.NODE_ENV = previousNodeEnv
    if (previousSiteUrl === undefined) delete env.NEXT_PUBLIC_SITE_URL
    else env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
  }
}

test("all product mutation routes wire the existing touched admin authorization boundary", async () => {
  await loadActions()

  for (const [relativePath, operation] of ROUTES) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8")
    assert.match(source, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
    assert.match(source, /admin-product-actions\.ts/)
    assert.match(source, /invalidatePublishedProductCatalog/)
    assert.match(source, /invalidatePublicProductCatalog:\s*invalidatePublishedProductCatalog/)
    assert.match(source, new RegExp(operation, "i"))
    assert.doesNotMatch(source, /\bDELETE\b/)
  }
})

test("cross-site product mutations are rejected before admin authorization", async () => {
  const actions = await loadActions()
  let authCalls = 0
  let mutationCalls = 0
  const handlers = actions.createAdminProductRouteHandlers(
    dependencies({
      authorizeAdmin: async () => {
        authCalls += 1
        return authorized()
      },
      createDraftProduct: async () => {
        mutationCalls += 1
        return storedProduct()
      },
    }),
  )

  await withRouteEnv(async () => {
    const response = await handlers.create(
      new Request("https://shop.test/api/admin/products", {
        method: "POST",
        headers: { Origin: "https://evil.test", "Content-Type": "application/json" },
        body: JSON.stringify(validProduct()),
      }),
    )
    assert.equal(response.status, 403)
    assert.equal(response.headers.get("Cache-Control"), "private, no-store")
    assert.equal(authCalls, 0)
    assert.equal(mutationCalls, 0)
  })
})

test("admin failures map to controlled status codes without invoking product storage", async () => {
  const actions = await loadActions()

  await withRouteEnv(async () => {
    for (const [reason, expectedStatus] of [
      ["unauthenticated", 401],
      ["mfa_required", 401],
      ["not_admin", 403],
      ["unavailable", 503],
    ] as const) {
      let mutationCalls = 0
      const handlers = actions.createAdminProductRouteHandlers(
        dependencies({
          authorizeAdmin: async () => ({ ok: false as const, reason }),
          createDraftProduct: async () => {
            mutationCalls += 1
            return storedProduct()
          },
        }),
      )
      const response = await handlers.create(
        allowedRequest("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(validProduct()),
        }),
      )
      assert.equal(response.status, expectedStatus)
      assert.deepEqual(await json(response), { error: "admin_access_denied" })
      assert.equal(mutationCalls, 0)
    }
  })
})

test("create validates form fields after authorization and returns structured 400 errors", async () => {
  const actions = await loadActions()
  let mutationCalls = 0
  const handlers = actions.createAdminProductRouteHandlers(
    dependencies({
      createDraftProduct: async () => {
        mutationCalls += 1
        return storedProduct()
      },
    }),
  )

  await withRouteEnv(async () => {
    const response = await handlers.create(
      allowedRequest("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(validProduct({ title: "   ", priceCents: 0 })),
      }),
    )
    assert.equal(response.status, 400)
    const body = await json(response)
    assert.equal(body.error, "invalid_product")
    assert.ok((body.fieldErrors as Record<string, string>).title)
    assert.ok((body.fieldErrors as Record<string, string>).priceCents)
    assert.equal(mutationCalls, 0)
  })
})

test("create returns 201 and update requires exact expectedUpdatedAt with a valid product id", async () => {
  const actions = await loadActions()
  let createInput: unknown
  let updateInput: unknown
  const handlers = actions.createAdminProductRouteHandlers(
    dependencies({
      createDraftProduct: async (input: unknown) => {
        createInput = input
        return storedProduct()
      },
      updateProduct: async (id: number, expectedUpdatedAt: string, input: unknown) => {
        updateInput = { id, expectedUpdatedAt, input }
        return storedProduct({ title: "Atualizado" })
      },
    }),
  )

  await withRouteEnv(async () => {
    const createResponse = await handlers.create(
      allowedRequest("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(validProduct({ title: "  Deck Proxy de Teste  " })),
      }),
    )
    assert.equal(createResponse.status, 201)
    assert.equal((createInput as { title: string }).title, "Deck Proxy de Teste")

    const updateResponse = await handlers.update(
      allowedRequest("/api/admin/products/3", {
        method: "PATCH",
        body: JSON.stringify({ ...validProduct(), expectedUpdatedAt: REVISION }),
      }),
      context(),
    )
    assert.equal(updateResponse.status, 200)
    assert.deepEqual(updateInput, {
      id: 3,
      expectedUpdatedAt: REVISION,
      input: validProduct(),
    })

    const missingRevision = await handlers.update(
      allowedRequest("/api/admin/products/3", {
        method: "PATCH",
        body: JSON.stringify(validProduct()),
      }),
      context(),
    )
    assert.equal(missingRevision.status, 400)
    assert.ok(((await json(missingRevision)).fieldErrors as Record<string, string>).expectedUpdatedAt)

    const badId = await handlers.update(
      allowedRequest("/api/admin/products/nope", {
        method: "PATCH",
        body: JSON.stringify({ ...validProduct(), expectedUpdatedAt: REVISION }),
      }),
      context("nope"),
    )
    assert.equal(badId.status, 404)
  })
})

test("successful product writes invalidate the public catalog after storage", async () => {
  const actions = await loadActions()
  const events: string[] = []
  const handlers = actions.createAdminProductRouteHandlers(
    dependencies({
      createDraftProduct: async () => {
        events.push("stored")
        return storedProduct()
      },
      invalidatePublicProductCatalog: async () => {
        events.push("invalidated")
      },
    }),
  )

  await withRouteEnv(async () => {
    const response = await handlers.create(
      allowedRequest("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(validProduct()),
      }),
    )
    assert.equal(response.status, 201)
    assert.deepEqual(events, ["stored", "invalidated"])
  })
})

test("cache invalidation failure does not turn a durable product write into a retryable failure", async () => {
  const actions = await loadActions()
  const handlers = actions.createAdminProductRouteHandlers(
    dependencies({
      invalidatePublicProductCatalog: async () => {
        throw new Error("cache unavailable")
      },
    }),
  )

  await withRouteEnv(async () => {
    const response = await handlers.create(
      allowedRequest("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(validProduct()),
      }),
    )
    assert.equal(response.status, 201)
  })
})

test("stale product revisions return stable 409 product_conflict responses", async () => {
  const actions = await loadActions()
  const handlers = actions.createAdminProductRouteHandlers(
    dependencies({
      updateProduct: async () => {
        throw new ProductConflictError()
      },
    }),
  )

  await withRouteEnv(async () => {
    const response = await handlers.update(
      allowedRequest("/api/admin/products/3", {
        method: "PATCH",
        body: JSON.stringify({ ...validProduct(), expectedUpdatedAt: REVISION }),
      }),
      context(),
    )
    assert.equal(response.status, 409)
    assert.deepEqual(await json(response), { error: "product_conflict" })
  })
})

test("publish archive and reactivate use separate POST lifecycle mutations with the expected revision", async () => {
  const actions = await loadActions()
  const calls: Array<[string, number, string]> = []
  const handlers = actions.createAdminProductRouteHandlers(
    dependencies({
      publishProduct: async (id: number, revision: string) => {
        calls.push(["publish", id, revision])
        return storedProduct({ status: "published" })
      },
      archiveProduct: async (id: number, revision: string) => {
        calls.push(["archive", id, revision])
        return storedProduct({ status: "archived" })
      },
      reactivateProduct: async (id: number, revision: string) => {
        calls.push(["reactivate", id, revision])
        return storedProduct({ status: "draft" })
      },
    }),
  )

  await withRouteEnv(async () => {
    for (const operation of ["publish", "archive", "reactivate"] as const) {
      const response = await handlers[operation](
        allowedRequest(`/api/admin/products/3/${operation}`, {
          method: "POST",
          body: JSON.stringify({ expectedUpdatedAt: REVISION }),
        }),
        context(),
      )
      assert.equal(response.status, 200)
    }
    assert.deepEqual(calls, [
      ["publish", 3, REVISION],
      ["archive", 3, REVISION],
      ["reactivate", 3, REVISION],
    ])
  })
})

test("malformed JSON and unexpected storage failures stay bounded and non-cacheable", async () => {
  const actions = await loadActions()
  const handlers = actions.createAdminProductRouteHandlers(
    dependencies({
      createDraftProduct: async () => {
        throw new Error("secret provider body")
      },
    }),
  )

  await withRouteEnv(async () => {
    const malformed = await handlers.create(
      allowedRequest("/api/admin/products", { method: "POST", body: "{" }),
    )
    assert.equal(malformed.status, 400)
    assert.deepEqual(await json(malformed), { error: "invalid_request" })

    const storageFailure = await handlers.create(
      allowedRequest("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(validProduct()),
      }),
    )
    assert.equal(storageFailure.status, 503)
    assert.deepEqual(await json(storageFailure), { error: "product_unavailable" })
    assert.equal(storageFailure.headers.get("Cache-Control"), "private, no-store")
  })
})
