import assert from "node:assert/strict"
import test from "node:test"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const OTHER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const SESSION_ID = "22222222-2222-4222-8222-222222222222"
const ADMIN_SESSION_ID = "33333333-3333-4333-8333-333333333333"
const NOW = 1_700_000_100

function claims(input?: {
  sub?: string
  aal?: "aal1" | "aal2"
  passwordAge?: number
  totpAge?: number
}) {
  return {
    sub: input?.sub ?? USER_ID,
    session_id: SESSION_ID,
    aal: input?.aal ?? "aal2",
    is_anonymous: false,
    amr: [
      { method: "totp", timestamp: NOW - (input?.totpAge ?? 50) },
      { method: "password", timestamp: NOW - (input?.passwordAge ?? 100) },
    ],
  }
}

async function loadAuth() {
  return import("../lib/server/admin-auth.ts").catch(() => null)
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const calls = {
    signedOut: 0,
    authorize: [] as Array<{ authSessionId: string; userId: string; touch: boolean }>,
    activate: [] as Array<{ authSessionId: string; userId: string }>,
    revoke: [] as Array<{ authSessionId: string; userId: string }>,
  }

  const deps = {
    adminUserId: USER_ID,
    nowSeconds: () => NOW,
    getClaims: async () => claims(),
    signOut: async () => {
      calls.signedOut += 1
    },
    authorizeSession: async (input: { authSessionId: string; userId: string; touch: boolean }) => {
      calls.authorize.push(input)
      return "active" as const
    },
    activateSession: async (input: { authSessionId: string; userId: string }) => {
      calls.activate.push(input)
      return ADMIN_SESSION_ID
    },
    revokeSession: async (input: { authSessionId: string; userId: string }) => {
      calls.revoke.push(input)
      return true
    },
    ...overrides,
  }

  return { deps, calls }
}

test("owner aal2 plus active admin session authorizes and touches by default", async () => {
  const auth = await loadAuth()
  assert.ok(auth, "expected admin-auth.ts to exist")
  const { deps, calls } = dependencies()

  assert.deepEqual(await auth.authorizeAdminAccessWithDependencies(deps), {
    ok: true,
    principal: { userId: USER_ID, authSessionId: SESSION_ID, aal: "aal2" },
  })
  assert.deepEqual(calls.authorize, [
    { authSessionId: SESSION_ID, userId: USER_ID, touch: true },
  ])
  assert.equal(calls.signedOut, 0)
})

test("touch=false is forwarded without extending activity", async () => {
  const auth = await loadAuth()
  assert.ok(auth)
  const { deps, calls } = dependencies()

  const result = await auth.authorizeAdminAccessWithDependencies(deps, { touch: false })
  assert.equal(result.ok, true)
  assert.equal(calls.authorize[0]?.touch, false)
})

test("aal1 requires MFA before any admin-session RPC", async () => {
  const auth = await loadAuth()
  assert.ok(auth)
  const { deps, calls } = dependencies({ getClaims: async () => claims({ aal: "aal1" }) })

  assert.deepEqual(await auth.authorizeAdminAccessWithDependencies(deps), {
    ok: false,
    reason: "mfa_required",
  })
  assert.equal(calls.authorize.length, 0)
  assert.equal(calls.signedOut, 0)
})

test("wrong owner is denied and local auth is cleared", async () => {
  const auth = await loadAuth()
  assert.ok(auth)
  const { deps, calls } = dependencies({ getClaims: async () => claims({ sub: OTHER_ID }) })

  assert.deepEqual(await auth.authorizeAdminAccessWithDependencies(deps), {
    ok: false,
    reason: "not_admin",
  })
  assert.equal(calls.authorize.length, 0)
  assert.equal(calls.signedOut, 1)
})

for (const status of ["missing", "revoked", "expired"] as const) {
  test(`${status} admin session fails closed and signs out`, async () => {
    const auth = await loadAuth()
    assert.ok(auth)
    const { deps, calls } = dependencies({ authorizeSession: async () => status })

    assert.deepEqual(await auth.authorizeAdminAccessWithDependencies(deps), {
      ok: false,
      reason: `session_${status}`,
    })
    assert.equal(calls.signedOut, 1)
  })
}

test("claim and repository dependency failures return unavailable and never authorize", async () => {
  const auth = await loadAuth()
  assert.ok(auth)

  const claimFailure = dependencies({
    getClaims: async () => {
      throw new Error("provider body must not escape")
    },
  })
  assert.deepEqual(await auth.authorizeAdminAccessWithDependencies(claimFailure.deps), {
    ok: false,
    reason: "unavailable",
  })
  assert.equal(claimFailure.calls.authorize.length, 0)

  const repositoryFailure = dependencies({
    authorizeSession: async () => {
      throw new Error("database body must not escape")
    },
  })
  assert.deepEqual(await auth.authorizeAdminAccessWithDependencies(repositoryFailure.deps), {
    ok: false,
    reason: "unavailable",
  })
})

test("activation requires aal2 and recent password plus TOTP evidence", async () => {
  const auth = await loadAuth()
  assert.ok(auth)
  const { deps, calls } = dependencies()

  assert.deepEqual(await auth.activateCurrentAdminSessionWithDependencies(deps), {
    ok: true,
    principal: { userId: USER_ID, authSessionId: SESSION_ID, aal: "aal2" },
  })
  assert.deepEqual(calls.activate, [{ authSessionId: SESSION_ID, userId: USER_ID }])

  const aal1 = dependencies({ getClaims: async () => claims({ aal: "aal1" }) })
  assert.deepEqual(await auth.activateCurrentAdminSessionWithDependencies(aal1.deps), {
    ok: false,
    reason: "mfa_required",
  })
  assert.equal(aal1.calls.activate.length, 0)
})

test("activation older than 600 seconds forces a fresh login", async () => {
  const auth = await loadAuth()
  assert.ok(auth)
  const { deps, calls } = dependencies({
    getClaims: async () => claims({ passwordAge: 601 }),
  })

  assert.deepEqual(await auth.activateCurrentAdminSessionWithDependencies(deps), {
    ok: false,
    reason: "fresh_login_required",
  })
  assert.equal(calls.activate.length, 0)
  assert.equal(calls.signedOut, 1)
})

test("a previously used Supabase session cannot reactivate admin access", async () => {
  const auth = await loadAuth()
  assert.ok(auth)
  const { deps, calls } = dependencies({ activateSession: async () => null })

  assert.deepEqual(await auth.activateCurrentAdminSessionWithDependencies(deps), {
    ok: false,
    reason: "session_reused",
  })
  assert.equal(calls.signedOut, 1)
})

test("activation repository failure is unavailable and never reports success", async () => {
  const auth = await loadAuth()
  assert.ok(auth)
  const { deps } = dependencies({
    activateSession: async () => {
      throw new Error("database failure")
    },
  })

  assert.deepEqual(await auth.activateCurrentAdminSessionWithDependencies(deps), {
    ok: false,
    reason: "unavailable",
  })
})

test("logout revokes the matching admin session and always clears local auth", async () => {
  const auth = await loadAuth()
  assert.ok(auth)
  const normal = dependencies()

  await auth.revokeCurrentAdminSessionWithDependencies(normal.deps)
  assert.deepEqual(normal.calls.revoke, [{ authSessionId: SESSION_ID, userId: USER_ID }])
  assert.equal(normal.calls.signedOut, 1)

  const failing = dependencies({
    revokeSession: async () => {
      throw new Error("repository unavailable")
    },
  })
  await auth.revokeCurrentAdminSessionWithDependencies(failing.deps)
  assert.equal(failing.calls.signedOut, 1)
})
