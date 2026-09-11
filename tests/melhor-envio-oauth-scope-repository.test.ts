import assert from "node:assert/strict"
import test from "node:test"

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const
const PHASE5_SCOPES = [
  "shipping-calculate",
  "cart-read",
  "cart-write",
  "orders-read",
  "shipping-checkout",
  "shipping-generate",
  "shipping-print",
  "shipping-tracking",
  "shipping-cancel",
] as const

type Environment = "sandbox" | "production"
type Scope = (typeof PHASE5_SCOPES)[number]

type RepositoryModule = {
  loadCredential(environment: Environment): Promise<{
    environment: Environment
    accessTokenEnvelope: string
    refreshTokenEnvelope: string
    accessTokenExpiresAt: string
    authorizedScopes: Scope[]
    tokenVersion: number
    status: "active" | "reauthorization_required"
    refreshLeaseOwner: string | null
    refreshLeaseExpiresAt: string | null
  } | null>
  upsertAuthorizedCredential(input: {
    environment: Environment
    accessTokenEnvelope: string
    refreshTokenEnvelope: string
    accessTokenExpiresAt: string
    authorizedScopes: readonly Scope[]
  }): Promise<void>
}

async function loadRepository(): Promise<RepositoryModule> {
  return (await import(
    "../lib/server/melhor-envio-oauth-repository.ts"
  )) as unknown as RepositoryModule
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

function credentialRow(scopes: unknown = [...PHASE5_SCOPES]) {
  return {
    environment: "sandbox",
    access_token_envelope: "encrypted-access",
    refresh_token_envelope: "encrypted-refresh",
    access_token_expires_at: "2026-10-01T12:00:00.000Z",
    authorized_scopes: scopes,
    token_version: 4,
    status: "active",
    refresh_lease_owner: null,
    refresh_lease_expires_at: null,
  }
}

test("credential reads select and strictly expose the persisted authorized scope set", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0]) => {
        const url = new URL(String(input))
        assert.equal(url.pathname, "/rest/v1/melhor_envio_oauth_credentials")
        assert.ok(
          (url.searchParams.get("select") ?? "")
            .split(",")
            .includes("authorized_scopes"),
          "credential select must include authorized_scopes",
        )
        return Response.json([credentialRow()])
      },
    )

    const repository = await loadRepository()
    const credential = await repository.loadCredential("sandbox")
    assert.deepEqual(credential?.authorizedScopes, PHASE5_SCOPES)
  })
})

test("credential reads reject unknown duplicate empty or missing scope evidence", async (t) => {
  await withSupabaseEnv(async () => {
    const invalidScopes: unknown[] = [
      undefined,
      [],
      ["shipping-calculate", "shipping-calculate"],
      ["shipping-calculate", "users-read"],
      ["shipping-calculate", ""],
    ]

    let index = 0
    t.mock.method(globalThis, "fetch", async () => {
      const row = credentialRow(invalidScopes[index++]) as Record<string, unknown>
      if (invalidScopes[index - 1] === undefined) delete row.authorized_scopes
      return Response.json([row])
    })

    const repository = await loadRepository()
    for (const _scopes of invalidScopes) {
      await assert.rejects(() => repository.loadCredential("sandbox"))
    }
  })
})

test("new authorization persists exact scopes only through the v2 atomic RPC", async (t) => {
  await withSupabaseEnv(async () => {
    let calls = 0
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        calls += 1
        const url = new URL(String(input))
        assert.equal(
          url.pathname,
          "/rest/v1/rpc/upsert_melhor_envio_authorized_credential_v2",
        )
        assert.equal(init?.method, "POST")
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_environment: "sandbox",
          p_access_token_envelope: "encrypted-access",
          p_refresh_token_envelope: "encrypted-refresh",
          p_access_token_expires_at: "2026-10-01T12:00:00.000Z",
          p_authorized_scopes: [...PHASE5_SCOPES],
        })
        return Response.json(5)
      },
    )

    const repository = await loadRepository()
    await repository.upsertAuthorizedCredential({
      environment: "sandbox",
      accessTokenEnvelope: "encrypted-access",
      refreshTokenEnvelope: "encrypted-refresh",
      accessTokenExpiresAt: "2026-10-01T12:00:00.000Z",
      authorizedScopes: PHASE5_SCOPES,
    })
    assert.equal(calls, 1)
  })
})
