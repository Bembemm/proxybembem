import assert from "node:assert/strict"
import test from "node:test"

const MODULE = "../lib/server/store-settings.ts"
const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const
const ADMIN_ID = "11111111-1111-4111-8111-111111111111"
const REVISION = "2026-09-14T21:00:00.000Z"
const NEXT_REVISION = "2026-09-14T21:01:00.000Z"

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "default",
    production_lead_time_business_days: 5,
    contact_email: "contato@proxybembem.com.br",
    contact_whatsapp_e164: "+5544991250332",
    notice_enabled: false,
    notice_text: null,
    updated_at: REVISION,
    ...overrides,
  }
}

function mutationInput(overrides: Record<string, unknown> = {}) {
  return {
    productionLeadTimeBusinessDays: 5,
    contactEmail: "contato@proxybembem.com.br",
    contactWhatsappE164: "+5544991250332",
    noticeEnabled: false,
    noticeText: null,
    ...overrides,
  }
}

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

test("admin read uses one explicit no-store singleton query and strict parsing", async (t) => {
  const repository = await import(MODULE)

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url = new URL(String(input))
        assert.equal(url.origin, "https://example.supabase.co")
        assert.equal(url.pathname, "/rest/v1/store_settings")
        assert.equal(url.searchParams.get("id"), "eq.default")
        assert.equal(url.searchParams.get("limit"), "1")
        const select = url.searchParams.get("select") ?? ""
        assert.equal(select.includes("*"), false)
        for (const field of [
          "id",
          "production_lead_time_business_days",
          "contact_email",
          "contact_whatsapp_e164",
          "notice_enabled",
          "notice_text",
          "updated_at",
        ]) {
          assert.ok(select.split(",").includes(field), `missing explicit select field ${field}`)
        }
        assert.equal(init?.cache, "no-store")
        assert.equal((init?.headers as Record<string, string>)?.apikey, "server-secret")
        return Response.json([row()])
      },
    )

    assert.deepEqual(await repository.getAdminStoreSettings(), {
      id: "default",
      productionLeadTimeBusinessDays: 5,
      contactEmail: "contato@proxybembem.com.br",
      contactWhatsappE164: "+5544991250332",
      noticeEnabled: false,
      noticeText: null,
      updatedAt: REVISION,
    })
  })
})

test("admin read fails closed for network status missing or malformed singleton", async (t) => {
  const repository = await import(MODULE)

  await withSupabaseEnv(async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => { throw new Error("server-secret raw failure") },
      async () => new Response("sensitive provider body", { status: 500 }),
      async () => Response.json([]),
      async () => Response.json([row({ id: "wrong" })]),
      async () => Response.json([row(), row()]),
    ]

    for (const responseFactory of cases) {
      t.mock.method(globalThis, "fetch", responseFactory)
      await assert.rejects(
        () => repository.getAdminStoreSettings(),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.equal(error.message.includes("server-secret"), false)
          assert.equal(error.message.includes("sensitive provider body"), false)
          return true
        },
      )
      t.mock.restoreAll()
    }
  })
})

test("public read returns only the sanitized projection on success", async (t) => {
  const repository = await import(MODULE)

  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async () => Response.json([row()]))
    assert.deepEqual(await repository.readPublicStoreSettings(), {
      productionLeadTimeBusinessDays: 5,
      contactEmail: "contato@proxybembem.com.br",
      contactWhatsappE164: "+5544991250332",
      noticeEnabled: false,
      noticeText: null,
    })
  })
})

test("public read falls back safely on every storage or parsing failure", async (t) => {
  const repository = await import(MODULE)

  await withSupabaseEnv(async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => { throw new Error("network") },
      async () => new Response("private body", { status: 503 }),
      async () => Response.json([]),
      async () => Response.json([row({ notice_enabled: true, notice_text: null })]),
      async () => Response.json([row(), row()]),
    ]

    for (const responseFactory of cases) {
      t.mock.method(globalThis, "fetch", responseFactory)
      assert.deepEqual(await repository.readPublicStoreSettings(), {
        productionLeadTimeBusinessDays: 5,
        contactEmail: null,
        contactWhatsappE164: null,
        noticeEnabled: false,
        noticeText: null,
      })
      t.mock.restoreAll()
    }
  })
})

test("admin update calls only the atomic allowlisted RPC arguments", async (t) => {
  const repository = await import(MODULE)

  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url = new URL(String(input))
        assert.equal(url.pathname, "/rest/v1/rpc/admin_update_store_settings")
        assert.equal(init?.method, "POST")
        assert.equal(init?.cache, "no-store")
        assert.equal((init?.headers as Record<string, string>)?.apikey, "server-secret")
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_admin_user_id: ADMIN_ID,
          p_expected_updated_at: REVISION,
          p_production_lead_time_business_days: 7,
          p_contact_email: "novo@proxybembem.com.br",
          p_contact_whatsapp_e164: "+5544999999999",
          p_notice_enabled: true,
          p_notice_text: "Prazo especial nesta semana.",
        })
        return Response.json({
          outcome: "updated",
          settings: row({
            production_lead_time_business_days: 7,
            contact_email: "novo@proxybembem.com.br",
            contact_whatsapp_e164: "+5544999999999",
            notice_enabled: true,
            notice_text: "Prazo especial nesta semana.",
            updated_at: NEXT_REVISION,
          }),
        })
      },
    )

    const result = await repository.updateAdminStoreSettings(
      ADMIN_ID,
      REVISION,
      mutationInput({
        productionLeadTimeBusinessDays: 7,
        contactEmail: "novo@proxybembem.com.br",
        contactWhatsappE164: "+5544999999999",
        noticeEnabled: true,
        noticeText: "Prazo especial nesta semana.",
      }),
    )
    assert.equal(result.updatedAt, NEXT_REVISION)
    assert.equal(result.productionLeadTimeBusinessDays, 7)
  })
})

test("admin update maps conflict and sanitizes storage failures", async (t) => {
  const repository = await import(MODULE)

  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ outcome: "conflict", settings: row() }),
    )
    await assert.rejects(
      () => repository.updateAdminStoreSettings(ADMIN_ID, REVISION, mutationInput()),
      (error: unknown) => error instanceof repository.StoreSettingsConflictError,
    )
    t.mock.restoreAll()

    t.mock.method(globalThis, "fetch", async () =>
      new Response("server-secret sensitive body", { status: 500 }),
    )
    await assert.rejects(
      () => repository.updateAdminStoreSettings(ADMIN_ID, REVISION, mutationInput()),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(error.message.includes("server-secret"), false)
        assert.equal(error.message.includes("sensitive body"), false)
        return true
      },
    )
  })
})
