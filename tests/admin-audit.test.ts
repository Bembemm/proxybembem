import assert from "node:assert/strict"
import test from "node:test"
import {
  appendAdminAudit,
  listAdminAuditForEntity,
} from "../lib/server/admin-audit.ts"

const ADMIN_ID = "550e8400-e29b-41d4-a716-446655440000"
const AUDIT_ID = "661f9511-f3ac-42e5-b827-557766551111"
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

test("appends a sanitized audit record and never mutates existing audit rows", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(url.pathname, "/rest/v1/admin_audit_log")
        assert.equal(init?.method, "POST")
        assert.equal(new Headers(init?.headers).get("prefer"), "return=representation")
        assert.deepEqual(JSON.parse(String(init?.body)), {
          admin_user_id: ADMIN_ID,
          entity_type: "order",
          entity_id: "PB-A1B2C3D4E5F6",
          action: "production_started",
          previous_values: { fulfillment_status: "awaiting_production" },
          new_values: { fulfillment_status: "in_production" },
          metadata: { source: "admin_panel" },
        })
        return new Response(
          JSON.stringify([
            {
              id: AUDIT_ID,
              admin_user_id: ADMIN_ID,
              entity_type: "order",
              entity_id: "PB-A1B2C3D4E5F6",
              action: "production_started",
              previous_values: { fulfillment_status: "awaiting_production" },
              new_values: { fulfillment_status: "in_production" },
              metadata: { source: "admin_panel" },
              created_at: "2026-09-02T04:00:00.000Z",
            },
          ]),
          { status: 201, headers: { "Content-Type": "application/json" } },
        )
      },
    )

    const result = await appendAdminAudit({
      adminUserId: ADMIN_ID,
      entityType: "order",
      entityId: "PB-A1B2C3D4E5F6",
      action: "production_started",
      previousValues: { fulfillment_status: "awaiting_production" },
      newValues: { fulfillment_status: "in_production" },
      metadata: { source: "admin_panel" },
    })
    assert.equal(result.action, "production_started")
  })
})

test("lists audit history for one entity newest first with bounded limit", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      assert.equal(url.pathname, "/rest/v1/admin_audit_log")
      assert.equal(url.searchParams.get("entity_type"), "eq.order")
      assert.equal(url.searchParams.get("entity_id"), "eq.PB-A1B2C3D4E5F6")
      assert.equal(url.searchParams.get("order"), "created_at.desc")
      assert.equal(url.searchParams.get("limit"), "25")
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    assert.deepEqual(
      await listAdminAuditForEntity({
        entityType: "order",
        entityId: "PB-A1B2C3D4E5F6",
        limit: 25,
      }),
      [],
    )
  })
})

test("rejects invalid identifiers and nested secrets before fetch", async (t) => {
  await withSupabaseEnv(async () => {
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      return new Response("[]", { status: 200 })
    })

    await assert.rejects(() =>
      appendAdminAudit({
        adminUserId: "bad",
        entityType: "order",
        entityId: "PB-A1B2C3D4E5F6",
        action: "production_started",
      }),
    )
    await assert.rejects(() =>
      appendAdminAudit({
        adminUserId: ADMIN_ID,
        entityType: "Bad Type",
        entityId: "PB-A1B2C3D4E5F6",
        action: "production_started",
      }),
    )
    await assert.rejects(() =>
      appendAdminAudit({
        adminUserId: ADMIN_ID,
        entityType: "order",
        entityId: "",
        action: "production_started",
      }),
    )
    await assert.rejects(() =>
      appendAdminAudit({
        adminUserId: ADMIN_ID,
        entityType: "order",
        entityId: "PB-A1B2C3D4E5F6",
        action: "Bad Action",
      }),
    )
    await assert.rejects(() =>
      appendAdminAudit({
        adminUserId: ADMIN_ID,
        entityType: "order",
        entityId: "PB-A1B2C3D4E5F6",
        action: "production_started",
        previousValues: { nested: { access_token: "no" } },
      }),
    )
    await assert.rejects(() =>
      appendAdminAudit({
        adminUserId: ADMIN_ID,
        entityType: "order",
        entityId: "PB-A1B2C3D4E5F6",
        action: "production_started",
        newValues: { password_hash: "no" },
      }),
    )
    await assert.rejects(() =>
      listAdminAuditForEntity({
        entityType: "order",
        entityId: "PB-A1B2C3D4E5F6",
        limit: 201,
      }),
    )
    assert.equal(calls, 0)
  })
})

test("exports no audit update or delete operation", async () => {
  const audit = await import("../lib/server/admin-audit.ts")
  assert.equal("updateAdminAudit" in audit, false)
  assert.equal("deleteAdminAudit" in audit, false)
})
