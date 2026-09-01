import assert from "node:assert/strict"
import test from "node:test"

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const

type Environment = "sandbox" | "production"
type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

type RepositoryModule = {
  createOAuthState(input: {
    stateHash: string
    environment: Environment
    expiresAt: string
  }): Promise<void>
  consumeOAuthState(input: {
    stateHash: string
    environment: Environment
  }): Promise<boolean>
  loadCredential(environment: Environment): Promise<{
    environment: Environment
    accessTokenEnvelope: string
    refreshTokenEnvelope: string
    accessTokenExpiresAt: string
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
  }): Promise<void>
  claimRefreshLease(input: {
    environment: Environment
    expectedVersion: number
    leaseOwner: string
    leaseSeconds: number
  }): Promise<boolean>
  commitRefresh(input: {
    environment: Environment
    expectedVersion: number
    leaseOwner: string
    accessTokenEnvelope: string
    refreshTokenEnvelope: string
    accessTokenExpiresAt: string
  }): Promise<boolean>
  releaseRefreshLease(input: {
    environment: Environment
    expectedVersion: number
    leaseOwner: string
  }): Promise<boolean>
  markReauthorizationRequired(input: {
    environment: Environment
    expectedVersion: number
    leaseOwner: string
    failureCode: string
  }): Promise<boolean>
}

async function loadRepository(): Promise<RepositoryModule> {
  return (await import("../lib/server/melhor-envio-oauth-repository.ts")) as RepositoryModule
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

function assertCommonRequest(input: FetchInput, init: FetchInit) {
  const url = String(input)
  assert.ok(url.startsWith("https://project.supabase.co/rest/v1/"))
  const headers = new Headers(init?.headers)
  assert.equal(headers.get("apikey"), "server-secret")
  assert.equal(headers.get("accept"), "application/json")
  assert.equal(init?.cache, "no-store")
  assert.ok(init?.signal instanceof AbortSignal)
  return { url, headers }
}

test("creates an OAuth state through the backend-only table with minimal response", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async (input: FetchInput, init?: FetchInit) => {
      const { url, headers } = assertCommonRequest(input, init)
      assert.equal(url, "https://project.supabase.co/rest/v1/melhor_envio_oauth_states")
      assert.equal(init?.method, "POST")
      assert.equal(headers.get("content-type"), "application/json")
      assert.equal(headers.get("prefer"), "return=minimal")
      assert.deepEqual(JSON.parse(String(init?.body)), {
        state_hash: "a".repeat(64),
        environment: "sandbox",
        expires_at: "2026-08-29T22:00:00.000Z",
      })
      return new Response(null, { status: 201 })
    })

    const repository = await loadRepository()
    await repository.createOAuthState({
      stateHash: "a".repeat(64),
      environment: "sandbox",
      expiresAt: "2026-08-29T22:00:00.000Z",
    })
  })
})

test("consumes OAuth state only through the atomic RPC and parses a strict boolean", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async (input: FetchInput, init?: FetchInit) => {
      const { url, headers } = assertCommonRequest(input, init)
      assert.equal(
        url,
        "https://project.supabase.co/rest/v1/rpc/consume_melhor_envio_oauth_state",
      )
      assert.equal(init?.method, "POST")
      assert.equal(headers.get("content-type"), "application/json")
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_state_hash: "b".repeat(64),
        p_environment: "production",
      })
      return Response.json(true)
    })

    const repository = await loadRepository()
    assert.equal(
      await repository.consumeOAuthState({
        stateHash: "b".repeat(64),
        environment: "production",
      }),
      true,
    )
  })
})

test("loads only the requested environment and maps one strict credential row", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async (input: FetchInput, init?: FetchInit) => {
      const { url } = assertCommonRequest(input, init)
      const parsed = new URL(url)
      assert.equal(parsed.pathname, "/rest/v1/melhor_envio_oauth_credentials")
      assert.equal(parsed.searchParams.get("environment"), "eq.sandbox")
      assert.equal(parsed.searchParams.get("limit"), "1")
      assert.equal(
        parsed.searchParams.get("select"),
        "environment,access_token_envelope,refresh_token_envelope,access_token_expires_at,token_version,status,refresh_lease_owner,refresh_lease_expires_at",
      )
      assert.equal(init?.method, "GET")

      return Response.json([
        {
          environment: "sandbox",
          access_token_envelope: "v1.iv.access.tag",
          refresh_token_envelope: "v1.iv.refresh.tag",
          access_token_expires_at: "2026-09-20T12:00:00.000Z",
          token_version: 4,
          status: "active",
          refresh_lease_owner: null,
          refresh_lease_expires_at: null,
        },
      ])
    })

    const repository = await loadRepository()
    assert.deepEqual(await repository.loadCredential("sandbox"), {
      environment: "sandbox",
      accessTokenEnvelope: "v1.iv.access.tag",
      refreshTokenEnvelope: "v1.iv.refresh.tag",
      accessTokenExpiresAt: "2026-09-20T12:00:00.000Z",
      tokenVersion: 4,
      status: "active",
      refreshLeaseOwner: null,
      refreshLeaseExpiresAt: null,
    })
  })
})

test("returns null only when the credential query returns no row", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async () => Response.json([]))
    const repository = await loadRepository()
    assert.equal(await repository.loadCredential("production"), null)
  })
})

test("stores initial authorization only through the atomic credential upsert RPC", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async (input: FetchInput, init?: FetchInit) => {
      const { url } = assertCommonRequest(input, init)
      assert.equal(
        url,
        "https://project.supabase.co/rest/v1/rpc/upsert_melhor_envio_authorized_credential",
      )
      assert.doesNotMatch(url, /melhor_envio_oauth_credentials\?/)
      assert.equal(init?.method, "POST")
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_environment: "sandbox",
        p_access_token_envelope: "v1.iv.access.tag",
        p_refresh_token_envelope: "v1.iv.refresh.tag",
        p_access_token_expires_at: "2026-09-20T12:00:00.000Z",
      })
      return Response.json(2)
    })

    const repository = await loadRepository()
    await repository.upsertAuthorizedCredential({
      environment: "sandbox",
      accessTokenEnvelope: "v1.iv.access.tag",
      refreshTokenEnvelope: "v1.iv.refresh.tag",
      accessTokenExpiresAt: "2026-09-20T12:00:00.000Z",
    })
  })
})

test("calls refresh lease RPCs with exact compare-and-set payloads", async (t) => {
  await withSupabaseEnv(async () => {
    const seen: Array<{ path: string; body: unknown }> = []
    t.mock.method(globalThis, "fetch", async (input: FetchInput, init?: FetchInit) => {
      const { url } = assertCommonRequest(input, init)
      seen.push({ path: new URL(url).pathname, body: JSON.parse(String(init?.body)) })
      return Response.json(true)
    })

    const repository = await loadRepository()
    assert.equal(
      await repository.claimRefreshLease({
        environment: "production",
        expectedVersion: 7,
        leaseOwner: "lease-owner",
        leaseSeconds: 30,
      }),
      true,
    )
    assert.equal(
      await repository.commitRefresh({
        environment: "production",
        expectedVersion: 7,
        leaseOwner: "lease-owner",
        accessTokenEnvelope: "v1.iv.new-access.tag",
        refreshTokenEnvelope: "v1.iv.new-refresh.tag",
        accessTokenExpiresAt: "2026-09-28T12:00:00.000Z",
      }),
      true,
    )
    assert.equal(
      await repository.releaseRefreshLease({
        environment: "production",
        expectedVersion: 8,
        leaseOwner: "lease-owner-2",
      }),
      true,
    )
    assert.equal(
      await repository.markReauthorizationRequired({
        environment: "production",
        expectedVersion: 8,
        leaseOwner: "lease-owner-3",
        failureCode: "refresh_rejected",
      }),
      true,
    )

    assert.deepEqual(seen, [
      {
        path: "/rest/v1/rpc/claim_melhor_envio_refresh_lease",
        body: {
          p_environment: "production",
          p_expected_version: 7,
          p_lease_owner: "lease-owner",
          p_lease_seconds: 30,
        },
      },
      {
        path: "/rest/v1/rpc/commit_melhor_envio_refresh",
        body: {
          p_environment: "production",
          p_expected_version: 7,
          p_lease_owner: "lease-owner",
          p_access_token_envelope: "v1.iv.new-access.tag",
          p_refresh_token_envelope: "v1.iv.new-refresh.tag",
          p_access_token_expires_at: "2026-09-28T12:00:00.000Z",
        },
      },
      {
        path: "/rest/v1/rpc/release_melhor_envio_refresh_lease",
        body: {
          p_environment: "production",
          p_expected_version: 8,
          p_lease_owner: "lease-owner-2",
        },
      },
      {
        path: "/rest/v1/rpc/mark_melhor_envio_reauthorization_required",
        body: {
          p_environment: "production",
          p_expected_version: 8,
          p_lease_owner: "lease-owner-3",
          p_failure_code: "refresh_rejected",
        },
      },
    ])
  })
})

test("rejects malformed Supabase response shapes instead of coercing them", async (t) => {
  await withSupabaseEnv(async () => {
    const repository = await loadRepository()

    t.mock.method(globalThis, "fetch", async () => Response.json("true"))
    await assert.rejects(
      () =>
        repository.consumeOAuthState({
          stateHash: "c".repeat(64),
          environment: "sandbox",
        }),
      /Invalid Melhor Envio OAuth repository response/,
    )
    t.mock.restoreAll()

    t.mock.method(globalThis, "fetch", async () =>
      Response.json([
        {
          environment: "sandbox",
          access_token_envelope: "access",
          refresh_token_envelope: "refresh",
          access_token_expires_at: "bad-date",
          token_version: 0,
          status: "active",
          refresh_lease_owner: null,
          refresh_lease_expires_at: null,
        },
      ]),
    )
    await assert.rejects(
      () => repository.loadCredential("sandbox"),
      /Invalid Melhor Envio OAuth repository response/,
    )
  })
})

test("keeps Supabase error bodies and secret material out of thrown errors", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify({
          message: "server-secret and v1.iv.secret-token.tag must never escape",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    )

    const repository = await loadRepository()
    await assert.rejects(
      () => repository.loadCredential("sandbox"),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /Melhor Envio OAuth repository request failed/)
        assert.doesNotMatch(error.message, /server-secret|secret-token/)
        return true
      },
    )
  })
})
