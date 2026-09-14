import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import { StoreSettingsConflictError } from "../lib/server/store-settings.ts"

const ACTIONS_URL = new URL("../lib/server/admin-store-settings-actions.ts", import.meta.url)
const ACTIONS_IMPORT = "../lib/server/admin-store-settings-actions.ts"
const ROUTE_URL = new URL("../app/api/admin/settings/route.ts", import.meta.url)

const ADMIN_ID = "11111111-1111-4111-8111-111111111111"
const SESSION_ID = "22222222-2222-4222-8222-222222222222"
const REVISION = "2026-09-14T21:00:00.000Z"
const NEXT_REVISION = "2026-09-14T21:01:00.000Z"

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    expectedUpdatedAt: REVISION,
    productionLeadTimeBusinessDays: 5,
    contactEmail: "contato@proxybembem.com.br",
    contactWhatsappE164: "+5544991250332",
    noticeEnabled: false,
    noticeText: null,
    ...overrides,
  }
}

function storedSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: "default",
    productionLeadTimeBusinessDays: 5,
    contactEmail: "contato@proxybembem.com.br",
    contactWhatsappE164: "+5544991250332",
    noticeEnabled: false,
    noticeText: null,
    updatedAt: NEXT_REVISION,
    ...overrides,
  }
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

function allowedRequest(body: string) {
  return new Request("https://shop.test/api/admin/settings", {
    method: "PATCH",
    headers: {
      Origin: "https://shop.test",
      "Content-Type": "application/json",
    },
    body,
  })
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorizeAdmin: async () => authorized(),
    updateAdminStoreSettings: async () => storedSettings(),
    invalidatePublicStoreSettings: () => {},
    ...overrides,
  }
}

async function loadActions() {
  assert.equal(existsSync(ACTIONS_URL), true, "admin store settings action module must exist")
  assert.equal(existsSync(ROUTE_URL), true, "admin store settings route must exist")
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

function assertNoStore(response: Response) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store")
}

test("route wires touched admin authorization and exposes PATCH only", async () => {
  await loadActions()
  const source = readFileSync(ROUTE_URL, "utf8")

  assert.match(source, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(source, /admin-store-settings-actions\.ts/)
  assert.match(source, /updateAdminStoreSettings/)
  assert.match(source, /invalidatePublicStoreSettings/)
  assert.match(source, /export\s+const\s+PATCH/)
  assert.doesNotMatch(source, /export\s+const\s+(?:POST|PUT|DELETE)/)
})

test("cross-origin mutation is rejected before admin authorization or storage", async () => {
  const actions = await loadActions()
  let authCalls = 0
  let updateCalls = 0
  let invalidations = 0
  const handler = actions.createAdminStoreSettingsRouteHandler(
    dependencies({
      authorizeAdmin: async () => {
        authCalls += 1
        return authorized()
      },
      updateAdminStoreSettings: async () => {
        updateCalls += 1
        return storedSettings()
      },
      invalidatePublicStoreSettings: () => {
        invalidations += 1
      },
    }),
  )

  await withRouteEnv(async () => {
    const response = await handler(
      new Request("https://shop.test/api/admin/settings", {
        method: "PATCH",
        headers: {
          Origin: "https://evil.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validBody()),
      }),
    )
    assert.equal(response.status, 403)
    assert.deepEqual(await json(response), { error: "admin_access_denied" })
    assertNoStore(response)
    assert.equal(authCalls, 0)
    assert.equal(updateCalls, 0)
    assert.equal(invalidations, 0)
  })
})

test("admin failures map to 401 403 or 503 without invoking storage", async () => {
  const actions = await loadActions()

  await withRouteEnv(async () => {
    for (const [reason, expectedStatus] of [
      ["unauthenticated", 401],
      ["mfa_required", 401],
      ["not_admin", 403],
      ["unavailable", 503],
    ] as const) {
      let updateCalls = 0
      let invalidations = 0
      const handler = actions.createAdminStoreSettingsRouteHandler(
        dependencies({
          authorizeAdmin: async () => ({ ok: false as const, reason }),
          updateAdminStoreSettings: async () => {
            updateCalls += 1
            return storedSettings()
          },
          invalidatePublicStoreSettings: () => {
            invalidations += 1
          },
        }),
      )

      const response = await handler(allowedRequest(JSON.stringify(validBody())))
      assert.equal(response.status, expectedStatus)
      assert.deepEqual(await json(response), { error: "admin_access_denied" })
      assertNoStore(response)
      assert.equal(updateCalls, 0)
      assert.equal(invalidations, 0)
    }
  })
})

test("bounded JSON body rejects payloads over 16 KiB and malformed JSON", async () => {
  const actions = await loadActions()
  let updateCalls = 0
  const handler = actions.createAdminStoreSettingsRouteHandler(
    dependencies({
      updateAdminStoreSettings: async () => {
        updateCalls += 1
        return storedSettings()
      },
    }),
  )

  await withRouteEnv(async () => {
    const oversized = await handler(
      allowedRequest(JSON.stringify(validBody({ noticeText: "x".repeat(17_000) }))),
    )
    assert.equal(oversized.status, 413)
    assert.deepEqual(await json(oversized), { error: "invalid_request" })
    assertNoStore(oversized)

    const malformed = await handler(allowedRequest("{"))
    assert.equal(malformed.status, 400)
    assert.deepEqual(await json(malformed), { error: "invalid_request" })
    assertNoStore(malformed)
    assert.equal(updateCalls, 0)
  })
})

test("missing invalid revision invalid fields and extra keys return structured 400", async () => {
  const actions = await loadActions()
  let updateCalls = 0
  const handler = actions.createAdminStoreSettingsRouteHandler(
    dependencies({
      updateAdminStoreSettings: async () => {
        updateCalls += 1
        return storedSettings()
      },
    }),
  )

  await withRouteEnv(async () => {
    for (const body of [
      validBody({ expectedUpdatedAt: undefined }),
      validBody({ expectedUpdatedAt: "not-a-date" }),
    ]) {
      const response = await handler(allowedRequest(JSON.stringify(body)))
      assert.equal(response.status, 400)
      const payload = await json(response)
      assert.equal(payload.error, "invalid_store_settings")
      assert.ok((payload.fieldErrors as Record<string, string>).expectedUpdatedAt)
      assertNoStore(response)
    }

    const invalidFields = await handler(
      allowedRequest(
        JSON.stringify(
          validBody({
            productionLeadTimeBusinessDays: 16,
            contactWhatsappE164: "(44) 99125-0332",
          }),
        ),
      ),
    )
    assert.equal(invalidFields.status, 400)
    const invalidPayload = await json(invalidFields)
    assert.equal(invalidPayload.error, "invalid_store_settings")
    assert.ok(
      (invalidPayload.fieldErrors as Record<string, string>).productionLeadTimeBusinessDays,
    )
    assert.ok((invalidPayload.fieldErrors as Record<string, string>).contactWhatsappE164)
    assertNoStore(invalidFields)

    const extraKey = await handler(
      allowedRequest(JSON.stringify(validBody({ secret: "should-not-be-accepted" }))),
    )
    assert.equal(extraKey.status, 400)
    const extraPayload = await json(extraKey)
    assert.equal(extraPayload.error, "invalid_store_settings")
    assert.ok((extraPayload.fieldErrors as Record<string, string>)._form)
    assertNoStore(extraKey)
    assert.equal(updateCalls, 0)
  })
})

test("successful PATCH uses authenticated principal normalized settings and invalidates once", async () => {
  const actions = await loadActions()
  let updateInput: unknown
  let invalidations = 0
  const handler = actions.createAdminStoreSettingsRouteHandler(
    dependencies({
      updateAdminStoreSettings: async (
        adminUserId: string,
        expectedUpdatedAt: string,
        input: unknown,
      ) => {
        updateInput = { adminUserId, expectedUpdatedAt, input }
        return storedSettings({
          productionLeadTimeBusinessDays: 7,
          contactEmail: "novo@proxybembem.com.br",
          noticeEnabled: true,
          noticeText: "Prazo especial nesta semana.",
        })
      },
      invalidatePublicStoreSettings: () => {
        invalidations += 1
      },
    }),
  )

  await withRouteEnv(async () => {
    const response = await handler(
      allowedRequest(
        JSON.stringify(
          validBody({
            productionLeadTimeBusinessDays: 7,
            contactEmail: "  NOVO@ProxyBembem.com.br  ",
            noticeEnabled: true,
            noticeText: "  Prazo especial nesta semana.  ",
          }),
        ),
      ),
    )

    assert.equal(response.status, 200)
    assertNoStore(response)
    assert.deepEqual(updateInput, {
      adminUserId: ADMIN_ID,
      expectedUpdatedAt: REVISION,
      input: {
        productionLeadTimeBusinessDays: 7,
        contactEmail: "novo@proxybembem.com.br",
        contactWhatsappE164: "+5544991250332",
        noticeEnabled: true,
        noticeText: "Prazo especial nesta semana.",
      },
    })
    assert.equal(invalidations, 1)
    assert.deepEqual(await json(response), {
      settings: storedSettings({
        productionLeadTimeBusinessDays: 7,
        contactEmail: "novo@proxybembem.com.br",
        noticeEnabled: true,
        noticeText: "Prazo especial nesta semana.",
      }),
    })
  })
})

test("conflict and dependency failure never invalidate the public cache", async () => {
  const actions = await loadActions()

  await withRouteEnv(async () => {
    let invalidations = 0
    const conflictHandler = actions.createAdminStoreSettingsRouteHandler(
      dependencies({
        updateAdminStoreSettings: async () => {
          throw new StoreSettingsConflictError()
        },
        invalidatePublicStoreSettings: () => {
          invalidations += 1
        },
      }),
    )

    const conflict = await conflictHandler(allowedRequest(JSON.stringify(validBody())))
    assert.equal(conflict.status, 409)
    assert.deepEqual(await json(conflict), { error: "store_settings_conflict" })
    assertNoStore(conflict)
    assert.equal(invalidations, 0)

    const unavailableHandler = actions.createAdminStoreSettingsRouteHandler(
      dependencies({
        updateAdminStoreSettings: async () => {
          throw new Error("secret provider body")
        },
        invalidatePublicStoreSettings: () => {
          invalidations += 1
        },
      }),
    )

    const unavailable = await unavailableHandler(allowedRequest(JSON.stringify(validBody())))
    assert.equal(unavailable.status, 503)
    assert.deepEqual(await json(unavailable), { error: "store_settings_unavailable" })
    assertNoStore(unavailable)
    assert.equal(invalidations, 0)
  })
})
