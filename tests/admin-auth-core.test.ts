import assert from "node:assert/strict"
import test from "node:test"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const OTHER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const SESSION_ID = "22222222-2222-4222-8222-222222222222"
const NOW = 1_700_000_100

async function loadCore() {
  return import("../lib/server/admin-auth-core.ts").catch(() => null)
}

function claims(aal: "aal1" | "aal2" = "aal2") {
  return {
    sub: USER_ID,
    session_id: SESSION_ID,
    aal,
    is_anonymous: false,
    amr: [
      { method: "totp", timestamp: NOW - 50 },
      { method: "password", timestamp: NOW - 100 },
    ],
  }
}

test("identity rejects missing, anonymous and non-owner claims", async () => {
  const core = await loadCore()
  assert.ok(core, "expected admin-auth-core.ts to exist")

  assert.deepEqual(
    core.validateAdminIdentity({ claims: null, adminUserId: USER_ID, requireAal2: true }),
    { ok: false, reason: "unauthenticated" },
  )
  assert.deepEqual(
    core.validateAdminIdentity({
      claims: { ...claims(), is_anonymous: true },
      adminUserId: USER_ID,
      requireAal2: true,
    }),
    { ok: false, reason: "unauthenticated" },
  )
  assert.deepEqual(
    core.validateAdminIdentity({
      claims: { ...claims(), sub: OTHER_ID },
      adminUserId: USER_ID,
      requireAal2: true,
    }),
    { ok: false, reason: "not_admin" },
  )
})

test("identity requires a canonical session id and known assurance level", async () => {
  const core = await loadCore()
  assert.ok(core, "expected admin-auth-core.ts to exist")

  for (const invalidClaims of [
    { ...claims(), session_id: undefined },
    { ...claims(), session_id: "not-a-uuid" },
    { ...claims(), aal: undefined },
    { ...claims(), aal: "aal3" },
  ]) {
    assert.deepEqual(
      core.validateAdminIdentity({
        claims: invalidClaims,
        adminUserId: USER_ID,
        requireAal2: true,
      }),
      { ok: false, reason: "invalid_session" },
    )
  }
})

test("aal1 is allowed only inside the MFA flow while protected access requires aal2", async () => {
  const core = await loadCore()
  assert.ok(core, "expected admin-auth-core.ts to exist")

  assert.deepEqual(
    core.validateAdminIdentity({ claims: claims("aal1"), adminUserId: USER_ID, requireAal2: true }),
    { ok: false, reason: "mfa_required" },
  )
  assert.deepEqual(
    core.validateAdminIdentity({ claims: claims("aal1"), adminUserId: USER_ID, requireAal2: false }),
    {
      ok: true,
      principal: { userId: USER_ID, authSessionId: SESSION_ID, aal: "aal1" },
    },
  )
  assert.deepEqual(
    core.validateAdminIdentity({ claims: claims("aal2"), adminUserId: USER_ID, requireAal2: true }),
    {
      ok: true,
      principal: { userId: USER_ID, authSessionId: SESSION_ID, aal: "aal2" },
    },
  )
})

test("fresh activation requires both password and totp within the 600 second window", async () => {
  const core = await loadCore()
  assert.ok(core, "expected admin-auth-core.ts to exist")
  assert.equal(core.hasFreshPasswordAndTotp({ claims: claims(), nowSeconds: NOW }), true)

  assert.equal(
    core.hasFreshPasswordAndTotp({
      claims: { ...claims(), amr: [{ method: "password", timestamp: NOW - 10 }] },
      nowSeconds: NOW,
    }),
    false,
  )
  assert.equal(
    core.hasFreshPasswordAndTotp({
      claims: { ...claims(), amr: [{ method: "totp", timestamp: NOW - 10 }] },
      nowSeconds: NOW,
    }),
    false,
  )
  assert.equal(
    core.hasFreshPasswordAndTotp({
      claims: {
        ...claims(),
        amr: [
          { method: "password", timestamp: NOW - 601 },
          { method: "totp", timestamp: NOW - 1 },
        ],
      },
      nowSeconds: NOW,
    }),
    false,
  )
})

test("future, malformed and non-array AMR evidence fail closed", async () => {
  const core = await loadCore()
  assert.ok(core, "expected admin-auth-core.ts to exist")

  const invalidAmr: unknown[] = [
    undefined,
    {},
    [
      { method: "password", timestamp: NOW + 1 },
      { method: "totp", timestamp: NOW - 1 },
    ],
    [
      { method: "password", timestamp: "1700000000" },
      { method: "totp", timestamp: NOW - 1 },
    ],
    [
      { method: "password", timestamp: NOW - 1.5 },
      { method: "totp", timestamp: NOW - 1 },
    ],
  ]

  for (const amr of invalidAmr) {
    assert.equal(
      core.hasFreshPasswordAndTotp({ claims: { ...claims(), amr }, nowSeconds: NOW }),
      false,
    )
  }
})

test("custom freshness window is honored for both factors", async () => {
  const core = await loadCore()
  assert.ok(core, "expected admin-auth-core.ts to exist")
  const value = {
    ...claims(),
    amr: [
      { method: "password", timestamp: NOW - 31 },
      { method: "totp", timestamp: NOW - 10 },
    ],
  }
  assert.equal(
    core.hasFreshPasswordAndTotp({ claims: value, nowSeconds: NOW, maxAgeSeconds: 30 }),
    false,
  )
  assert.equal(
    core.hasFreshPasswordAndTotp({ claims: value, nowSeconds: NOW, maxAgeSeconds: 31 }),
    true,
  )
})
