import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const productImagesUrl = new URL("../lib/server/product-images.ts", import.meta.url)
const routeUrl = new URL(
  "../app/api/admin/products/image-upload/route.ts",
  import.meta.url,
)
const PRODUCT_IMAGES_IMPORT = "../lib/server/product-images.ts"

const ADMIN_ID = "11111111-1111-4111-8111-111111111111"
const SESSION_ID = "22222222-2222-4222-8222-222222222222"
const UUID_A = "33333333-3333-4333-8333-333333333333"
const UUID_B = "44444444-4444-4444-8444-444444444444"
const EIGHT_MIB = 8 * 1024 * 1024

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    originalFilename: "deck-proxy.webp",
    mimeType: "image/webp",
    byteSize: 512_000,
    ...overrides,
  }
}

function allowedRequest(body: unknown) {
  return new Request("https://shop.test/api/admin/products/image-upload", {
    method: "POST",
    headers: {
      Origin: "https://shop.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
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

async function loadProductImages() {
  assert.equal(
    existsSync(productImagesUrl),
    true,
    "product image authorization module must exist",
  )
  assert.equal(existsSync(routeUrl), true, "product image upload route must exist")
  return import(PRODUCT_IMAGES_IMPORT)
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

test("production image upload route uses touched admin auth and current Supabase signed-upload API", async () => {
  await loadProductImages()

  const routeSource = readFileSync(routeUrl, "utf8")
  const moduleSource = readFileSync(productImagesUrl, "utf8")

  assert.match(routeSource, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(moduleSource, /createSupabaseServiceClient/)
  assert.match(moduleSource, /createSignedUploadUrl/)
  assert.doesNotMatch(routeSource, /SUPABASE_SECRET_KEY/)
  assert.doesNotMatch(moduleSource, /process\.env\.SUPABASE_SECRET_KEY/)
})

test("image upload authorization requires active admin access", async () => {
  const images = await loadProductImages()
  let issueCalls = 0
  const handler = images.createProductImageUploadHandler({
    authorizeAdmin: async () => ({ ok: false as const, reason: "mfa_required" }),
    issueSignedUpload: async () => {
      issueCalls += 1
      return { path: `products/${UUID_A}.webp`, token: "signed-token" }
    },
  })

  await withRouteEnv(async () => {
    const response = await handler(allowedRequest(metadata()))
    assert.equal(response.status, 401)
    assert.deepEqual(await json(response), { error: "admin_access_denied" })
    assert.equal(response.headers.get("Cache-Control"), "private, no-store")
    assert.equal(issueCalls, 0)
  })
})

test("cross-site image upload requests fail before admin authorization", async () => {
  const images = await loadProductImages()
  let authCalls = 0
  const handler = images.createProductImageUploadHandler({
    authorizeAdmin: async () => {
      authCalls += 1
      return authorized()
    },
    issueSignedUpload: async () => ({
      path: `products/${UUID_A}.webp`,
      token: "signed-token",
    }),
  })

  await withRouteEnv(async () => {
    const response = await handler(
      new Request("https://shop.test/api/admin/products/image-upload", {
        method: "POST",
        headers: {
          Origin: "https://evil.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata()),
      }),
    )
    assert.equal(response.status, 403)
    assert.equal(authCalls, 0)
  })
})

test("rejects non-image mime types before issuing signed upload", async () => {
  const images = await loadProductImages()
  let issueCalls = 0
  const handler = images.createProductImageUploadHandler({
    authorizeAdmin: async () => authorized(),
    issueSignedUpload: async () => {
      issueCalls += 1
      return { path: `products/${UUID_A}.webp`, token: "signed-token" }
    },
  })

  await withRouteEnv(async () => {
    const response = await handler(
      allowedRequest(metadata({ mimeType: "application/pdf" })),
    )
    assert.equal(response.status, 400)
    const body = await json(response)
    assert.equal(body.error, "invalid_product_image")
    assert.ok((body.fieldErrors as Record<string, string>).mimeType)
    assert.equal(issueCalls, 0)
  })
})

test("rejects images above the configured 8 MiB maximum", async () => {
  const images = await loadProductImages()
  let issueCalls = 0
  const handler = images.createProductImageUploadHandler({
    authorizeAdmin: async () => authorized(),
    issueSignedUpload: async () => {
      issueCalls += 1
      return { path: `products/${UUID_A}.png`, token: "signed-token" }
    },
  })

  await withRouteEnv(async () => {
    const response = await handler(
      allowedRequest(metadata({ mimeType: "image/png", byteSize: EIGHT_MIB + 1 })),
    )
    assert.equal(response.status, 400)
    const body = await json(response)
    assert.equal(body.error, "invalid_product_image")
    assert.ok((body.fieldErrors as Record<string, string>).byteSize)
    assert.equal(issueCalls, 0)
  })
})

test("generates immutable unique product image paths and never enables overwrite", async () => {
  const images = await loadProductImages()
  const uuids = [UUID_A, UUID_B]
  const signerCalls: Array<{ bucket: string; path: string; upsert: boolean }> = []

  async function createOne() {
    return images.createSignedProductImageUpload(metadata(), {
      randomUUID: () => uuids.shift()!,
      createSignedUploadUrl: async (
        bucket: string,
        path: string,
        options: { upsert: boolean },
      ) => {
        signerCalls.push({ bucket, path, upsert: options.upsert })
        return { token: `token-${signerCalls.length}` }
      },
    })
  }

  const first = await createOne()
  const second = await createOne()

  assert.deepEqual(first, {
    path: `products/${UUID_A}.webp`,
    token: "token-1",
  })
  assert.deepEqual(second, {
    path: `products/${UUID_B}.webp`,
    token: "token-2",
  })
  assert.notEqual(first.path, second.path)
  assert.deepEqual(signerCalls, [
    {
      bucket: "product-images",
      path: `products/${UUID_A}.webp`,
      upsert: false,
    },
    {
      bucket: "product-images",
      path: `products/${UUID_B}.webp`,
      upsert: false,
    },
  ])
})
