import assert from "node:assert/strict"
import test from "node:test"

const SESSION_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "11111111-1111-4111-8111-111111111111"
const ADMIN_SESSION_ID = "33333333-3333-4333-8333-333333333333"
const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type Status = "active" | "missing" | "revoked" | "expired"
type Repository = {
  activateAdminSession(input: { authSessionId: string; userId: string }): Promise<string | null>
  authorizeAdminSession(input: {
    authSessionId: string
    userId: string
    touch: boolean
  }): Promise<Status>
  revokeAdminSession(input: { authSessionId: string; userId: string }): Promise<boolean>
}

async function loadRepository(): Promise<Repository | null> {
  return import("../lib/server/admin-session-repository.ts")
    .then((module) => module as Repository)
    .catch(() => null)
}

async function withSupabaseEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])
  process.env.SUPABASE_URL = "https://project.supabase.co"
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

function assertRpcRequest(
  input: FetchInput,
  init: FetchInit,
  name: string,
  body: Record<string, unknown>,
) {
  const url = new URL(String(input))
  assert.equal(url.origin, "https://project.supabase.co")
  assert.equal(url.pathname, `/rest/v1/rpc/${name}`)
  assert.equal(init?.method, "POST")
  assert.equal(init?.cache, "no-store")
  assert.ok(init?.signal instanceof AbortSignal)
  const headers = new Headers(init?.headers)
  assert.equal(headers.get("apikey"), "server-secret")
  assert.equal(headers.get("accept"), "application/json")
  assert.equal(headers.get("content-type"), "application/json")
  assert.deepEqual(JSON.parse(String(init?.body)), body)
}

test("activation calls the atomic RPC and strictly accepts UUID or null", async (t) => {
  await withSupabaseEnv(async () => {
    const repository = await loadRepository()
    assert.ok(repository, "expected admin-session-repository.ts to exist")
    let responseValue: unknown = ADMIN_SESSION_ID
    t.mock.method(globalThis, "fetch", async (input: FetchInput, init?: FetchInit) => {
      assertRpcRequest(input, init, "activate_admin_session", {
        p_auth_session_id: SESSION_ID,
        p_user_id: USER_ID,
      })
      return Response.json(responseValue)
    })

    assert.equal(
      await repository.activateAdminSession({ authSessionId: SESSION_ID, userId: USER_ID }),
      ADMIN_SESSION_ID,
    )
    responseValue = null
    assert.equal(
      await repository.activateAdminSession({ authSessionId: SESSION_ID, userId: USER_ID }),
      null,
    )
    responseValue = "not-a-uuid"
    await assert.rejects(
      repository.activateAdminSession({ authSessionId: SESSION_ID, userId: USER_ID }),
      /Invalid admin session repository response/,
    )
  })
})

test("authorization calls the exact RPC and parses only documented statuses", async (t) => {
  await withSupabaseEnv(async () => {
    const repository = await loadRepository()
    assert.ok(repository, "expected admin-session-repository.ts to exist")
    const statuses: Status[] = ["active", "missing", "revoked", "expired"]
    let index = 0
    t.mock.method(globalThis, "fetch", async (input: FetchInput, init?: FetchInit) => {
      assertRpcRequest(input, init, "authorize_admin_session", {
        p_auth_session_id: SESSION_ID,
        p_user_id: USER_ID,
        p_touch: true,
      })
      return Response.json(statuses[index++])
    })

    for (const expected of statuses) {
      assert.equal(
        await repository.authorizeAdminSession({
          authSessionId: SESSION_ID,
          userId: USER_ID,
          touch: true,
        }),
        expected,
      )
    }
  })
})

test("authorization forwards touch=false without refreshing activity", async (t) => {
  await withSupabaseEnv(async () => {
    const repository = await loadRepository()
    assert.ok(repository, "expected admin-session-repository.ts to exist")
    t.mock.method(globalThis, "fetch", async (input: FetchInput, init?: FetchInit) => {
      assertRpcRequest(input, init, "authorize_admin_session", {
        p_auth_session_id: SESSION_ID,
        p_user_id: USER_ID,
        p_touch: false,
      })
      return Response.json("active")
    })
    assert.equal(
      await repository.authorizeAdminSession({
        authSessionId: SESSION_ID,
        userId: USER_ID,
        touch: false,
      }),
      "active",
    )
  })
})

test("revoke calls the exact RPC and strictly parses a boolean", async (t) => {
  await withSupabaseEnv(async () => {
    const repository = await loadRepository()
    assert.ok(repository, "expected admin-session-repository.ts to exist")
    let responseValue: unknown = true
    t.mock.method(globalThis, "fetch", async (input: FetchInput, init?: FetchInit) => {
      assertRpcRequest(input, init, "revoke_admin_session", {
        p_auth_session_id: SESSION_ID,
        p_user_id: USER_ID,
      })
      return Response.json(responseValue)
    })
    assert.equal(
      await repository.revokeAdminSession({ authSessionId: SESSION_ID, userId: USER_ID }),
      true,
    )
    responseValue = "true"
    await assert.rejects(
      repository.revokeAdminSession({ authSessionId: SESSION_ID, userId: USER_ID }),
      /Invalid admin session repository response/,
    )
  })
})

test("repository sanitizes non-2xx, network and malformed response failures", async (t) => {
  await withSupabaseEnv(async () => {
    const repository = await loadRepository()
    assert.ok(repository, "expected admin-session-repository.ts to exist")

    t.mock.method(globalThis, "fetch", async () =>
      new Response("database-secret-body", { status: 500 }),
    )
    await assert.rejects(
      repository.authorizeAdminSession({ authSessionId: SESSION_ID, userId: USER_ID, touch: true }),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(error.message, "Admin session repository request failed")
        assert.doesNotMatch(error.message, /database-secret-body|server-secret/)
        return true
      },
    )

    t.mock.restoreAll()
    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("network provider detail")
    })
    await assert.rejects(
      repository.activateAdminSession({ authSessionId: SESSION_ID, userId: USER_ID }),
      /Admin session repository request failed/,
    )

    t.mock.restoreAll()
    t.mock.method(globalThis, "fetch", async () => new Response("not-json", { status: 200 }))
    await assert.rejects(
      repository.revokeAdminSession({ authSessionId: SESSION_ID, userId: USER_ID }),
      /Invalid admin session repository response/,
    )
  })
})
