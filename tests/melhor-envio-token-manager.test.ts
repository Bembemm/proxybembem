import assert from "node:assert/strict"
import test from "node:test"
import {
  MELHOR_ENVIO_ACTIVE_SCOPES,
  type MelhorEnvioOAuthScope,
} from "../lib/server/melhor-envio-oauth-scopes.ts"

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.parse("2026-08-29T21:00:00.000Z")

type Environment = "sandbox" | "production"
type Credential = {
  environment: Environment
  accessTokenEnvelope: string
  refreshTokenEnvelope: string
  accessTokenExpiresAt: string
  authorizedScopes: MelhorEnvioOAuthScope[]
  tokenVersion: number
  status: "active" | "reauthorization_required"
  refreshLeaseOwner: string | null
  refreshLeaseExpiresAt: string | null
}

type Dependencies = {
  getOAuthConfig(): { environment: Environment; tokenEncryptionKey: string }
  loadCredential(environment: Environment): Promise<Credential | null>
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
  refreshTokens(refreshToken: string): Promise<{
    tokenType: "Bearer"
    accessToken: string
    refreshToken: string
    expiresInSeconds: number
  }>
  encryptToken(input: {
    plaintext: string
    environment: Environment
    kind: "access" | "refresh"
    encryptionKeyHex: string
  }): string
  decryptToken(input: {
    envelope: string
    environment: Environment
    kind: "access" | "refresh"
    encryptionKeyHex: string
  }): string
  now(): number
  sleep(ms: number): Promise<void>
  randomUUID(): string
}

type ManagerModule = {
  createMelhorEnvioTokenManager(deps: Dependencies): (options?: {
    forceRefresh?: boolean
    rejectedTokenVersion?: number
    requiredScopes?: readonly MelhorEnvioOAuthScope[]
  }) => Promise<{
    accessToken: string
    tokenVersion: number
    authorizedScopes: MelhorEnvioOAuthScope[]
  }>
  MelhorEnvioTokenManagerError: new (...args: never[]) => Error & {
    code: "reauthorization_required" | "temporary_unavailable" | "invalid_credential"
  }
}

async function loadManagerModule(): Promise<ManagerModule> {
  return (await import("../lib/server/melhor-envio-token-manager.ts")) as ManagerModule
}

function credential(overrides: Partial<Credential> = {}): Credential {
  return {
    environment: "sandbox",
    accessTokenEnvelope: "enc:access:old-access",
    refreshTokenEnvelope: "enc:refresh:old-refresh",
    accessTokenExpiresAt: new Date(NOW + 20 * DAY_MS).toISOString(),
    authorizedScopes: ["shipping-calculate"],
    tokenVersion: 4,
    status: "active",
    refreshLeaseOwner: null,
    refreshLeaseExpiresAt: null,
    ...overrides,
  }
}

function makeDeps(overrides: Partial<Dependencies> = {}) {
  const calls = {
    claims: [] as unknown[],
    commits: [] as unknown[],
    releases: [] as unknown[],
    marks: [] as unknown[],
    refreshTokens: [] as string[],
    encrypts: [] as unknown[],
    decrypts: [] as unknown[],
    sleeps: [] as number[],
  }

  let row: Credential | null = credential()

  const deps: Dependencies = {
    getOAuthConfig: () => ({ environment: "sandbox", tokenEncryptionKey: "a".repeat(64) }),
    loadCredential: async () => row,
    claimRefreshLease: async (input) => {
      calls.claims.push(input)
      return true
    },
    commitRefresh: async (input) => {
      calls.commits.push(input)
      row = credential({
        accessTokenEnvelope: input.accessTokenEnvelope,
        refreshTokenEnvelope: input.refreshTokenEnvelope,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        tokenVersion: input.expectedVersion + 1,
      })
      return true
    },
    releaseRefreshLease: async (input) => {
      calls.releases.push(input)
      return true
    },
    markReauthorizationRequired: async (input) => {
      calls.marks.push(input)
      return true
    },
    refreshTokens: async (refreshToken) => {
      calls.refreshTokens.push(refreshToken)
      return {
        tokenType: "Bearer",
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresInSeconds: 2_592_000,
      }
    },
    encryptToken: (input) => {
      calls.encrypts.push(input)
      return `enc:${input.kind}:${input.plaintext}`
    },
    decryptToken: (input) => {
      calls.decrypts.push(input)
      const prefix = `enc:${input.kind}:`
      if (!input.envelope.startsWith(prefix)) throw new Error("decrypt failed secret")
      return input.envelope.slice(prefix.length)
    },
    now: () => NOW,
    sleep: async (ms) => {
      calls.sleeps.push(ms)
    },
    randomUUID: () => "lease-owner-uuid",
    ...overrides,
  }

  return {
    deps,
    calls,
    setRow(next: Credential | null) {
      row = next
    },
  }
}

test("returns a decrypted quote-only access token with its persisted scope evidence", async () => {
  const module = await loadManagerModule()
  const { deps, calls } = makeDeps()
  const getToken = module.createMelhorEnvioTokenManager(deps)

  assert.deepEqual(await getToken(), {
    accessToken: "old-access",
    tokenVersion: 4,
    authorizedScopes: ["shipping-calculate"],
  })
  assert.equal(calls.claims.length, 0)
  assert.equal(calls.refreshTokens.length, 0)
  assert.deepEqual(calls.decrypts, [
    {
      envelope: "enc:access:old-access",
      environment: "sandbox",
      kind: "access",
      encryptionKeyHex: "a".repeat(64),
    },
  ])
})

test("rejects a shipment operation when required scopes are absent before decrypt or refresh work", async () => {
  const module = await loadManagerModule()
  const { deps, calls } = makeDeps()
  const getToken = module.createMelhorEnvioTokenManager(deps)

  await assert.rejects(
    () => getToken({ requiredScopes: ["shipping-checkout"] }),
    (error: unknown) => {
      assert.ok(error instanceof module.MelhorEnvioTokenManagerError)
      assert.equal(error.code, "reauthorization_required")
      return true
    },
  )
  assert.equal(calls.decrypts.length, 0)
  assert.equal(calls.claims.length, 0)
  assert.equal(calls.refreshTokens.length, 0)
})

test("accepts active shipment scopes only when the persisted grant contains them", async () => {
  const module = await loadManagerModule()
  const { deps, calls, setRow } = makeDeps()
  setRow(credential({ authorizedScopes: [...MELHOR_ENVIO_ACTIVE_SCOPES] }))
  const getToken = module.createMelhorEnvioTokenManager(deps)

  assert.deepEqual(
    await getToken({ requiredScopes: ["cart-write"] }),
    {
      accessToken: "old-access",
      tokenVersion: 4,
      authorizedScopes: [...MELHOR_ENVIO_ACTIVE_SCOPES],
    },
  )
  assert.equal(calls.claims.length, 0)
  assert.equal(calls.refreshTokens.length, 0)
})

test("proactively refreshes at seven days, rotates both encrypted tokens and preserves authorized scopes", async () => {
  const module = await loadManagerModule()
  const { deps, calls, setRow } = makeDeps()
  setRow(
    credential({
      accessTokenExpiresAt: new Date(NOW + 7 * DAY_MS).toISOString(),
      authorizedScopes: [...MELHOR_ENVIO_ACTIVE_SCOPES],
    }),
  )
  const getToken = module.createMelhorEnvioTokenManager(deps)

  assert.deepEqual(
    await getToken({ requiredScopes: ["cart-write"] }),
    {
      accessToken: "new-access",
      tokenVersion: 5,
      authorizedScopes: [...MELHOR_ENVIO_ACTIVE_SCOPES],
    },
  )
  assert.deepEqual(calls.refreshTokens, ["old-refresh"])
  assert.deepEqual(calls.claims, [
    {
      environment: "sandbox",
      expectedVersion: 4,
      leaseOwner: "lease-owner-uuid",
      leaseSeconds: 30,
    },
  ])
  assert.deepEqual(calls.encrypts, [
    {
      plaintext: "new-access",
      environment: "sandbox",
      kind: "access",
      encryptionKeyHex: "a".repeat(64),
    },
    {
      plaintext: "new-refresh",
      environment: "sandbox",
      kind: "refresh",
      encryptionKeyHex: "a".repeat(64),
    },
  ])
  assert.deepEqual(calls.commits, [
    {
      environment: "sandbox",
      expectedVersion: 4,
      leaseOwner: "lease-owner-uuid",
      accessTokenEnvelope: "enc:access:new-access",
      refreshTokenEnvelope: "enc:refresh:new-refresh",
      accessTokenExpiresAt: new Date(NOW + 2_592_000 * 1000).toISOString(),
    },
  ])
})

test("a proactive lease loser may use the still-valid current token without refreshing", async () => {
  const module = await loadManagerModule()
  const { deps, calls, setRow } = makeDeps({ claimRefreshLease: async () => false })
  setRow(credential({ accessTokenExpiresAt: new Date(NOW + DAY_MS).toISOString() }))
  const getToken = module.createMelhorEnvioTokenManager(deps)

  assert.deepEqual(await getToken(), {
    accessToken: "old-access",
    tokenVersion: 4,
    authorizedScopes: ["shipping-calculate"],
  })
  assert.equal(calls.refreshTokens.length, 0)
})

test("forced refresh never reuses the rejected version and waits for a newer committed version", async () => {
  const module = await loadManagerModule()
  let loads = 0
  const { deps, calls } = makeDeps({
    claimRefreshLease: async () => false,
    loadCredential: async () => {
      loads += 1
      return loads < 3
        ? credential()
        : credential({
            tokenVersion: 5,
            accessTokenEnvelope: "enc:access:winner-access",
            refreshTokenEnvelope: "enc:refresh:winner-refresh",
            accessTokenExpiresAt: new Date(NOW + 30 * DAY_MS).toISOString(),
          })
    },
  })
  const getToken = module.createMelhorEnvioTokenManager(deps)

  assert.deepEqual(
    await getToken({ forceRefresh: true, rejectedTokenVersion: 4 }),
    {
      accessToken: "winner-access",
      tokenVersion: 5,
      authorizedScopes: ["shipping-calculate"],
    },
  )
  assert.equal(calls.refreshTokens.length, 0)
  assert.ok(calls.sleeps.length >= 1)
})

test("forced refresh fails closed if no newer token appears before the bounded wait ends", async () => {
  const module = await loadManagerModule()
  const { deps } = makeDeps({ claimRefreshLease: async () => false })
  const getToken = module.createMelhorEnvioTokenManager(deps)

  await assert.rejects(
    () => getToken({ forceRefresh: true, rejectedTokenVersion: 4 }),
    (error: unknown) => {
      assert.ok(error instanceof module.MelhorEnvioTokenManagerError)
      assert.equal(error.code, "temporary_unavailable")
      return true
    },
  )
})

test("a stale refresh commit cannot overwrite a newer version and returns the winner token", async () => {
  const module = await loadManagerModule()
  let loads = 0
  const { deps, calls } = makeDeps({
    commitRefresh: async (input) => {
      calls.commits.push(input)
      return false
    },
    loadCredential: async () => {
      loads += 1
      if (loads === 1) {
        return credential({ accessTokenExpiresAt: new Date(NOW + DAY_MS).toISOString() })
      }
      return credential({
        tokenVersion: 5,
        accessTokenEnvelope: "enc:access:other-winner-access",
        refreshTokenEnvelope: "enc:refresh:other-winner-refresh",
        accessTokenExpiresAt: new Date(NOW + 30 * DAY_MS).toISOString(),
      })
    },
  })
  const getToken = module.createMelhorEnvioTokenManager(deps)

  assert.deepEqual(await getToken(), {
    accessToken: "other-winner-access",
    tokenVersion: 5,
    authorizedScopes: ["shipping-calculate"],
  })
  assert.equal(calls.commits.length, 1)
})

test("irrecoverable provider refresh rejection marks reauthorization required under the lease", async () => {
  const oauth = await import("../lib/server/melhor-envio-oauth-client.ts")
  const module = await loadManagerModule()
  const { deps, calls, setRow } = makeDeps({
    refreshTokens: async () => {
      throw new oauth.MelhorEnvioOAuthError(401, "unauthenticated")
    },
  })
  setRow(credential({ accessTokenExpiresAt: new Date(NOW + DAY_MS).toISOString() }))
  const getToken = module.createMelhorEnvioTokenManager(deps)

  await assert.rejects(
    () => getToken(),
    (error: unknown) => {
      assert.ok(error instanceof module.MelhorEnvioTokenManagerError)
      assert.equal(error.code, "reauthorization_required")
      return true
    },
  )
  assert.deepEqual(calls.marks, [
    {
      environment: "sandbox",
      expectedVersion: 4,
      leaseOwner: "lease-owner-uuid",
      failureCode: "refresh_rejected",
    },
  ])
  assert.equal(calls.releases.length, 0)
})

test("transient refresh failure releases only its own lease and does not mark authorization revoked", async () => {
  const oauth = await import("../lib/server/melhor-envio-oauth-client.ts")
  const module = await loadManagerModule()
  const { deps, calls, setRow } = makeDeps({
    refreshTokens: async () => {
      throw new oauth.MelhorEnvioOAuthError(503, "provider_error")
    },
  })
  setRow(credential({ accessTokenExpiresAt: new Date(NOW + DAY_MS).toISOString() }))
  const getToken = module.createMelhorEnvioTokenManager(deps)

  await assert.rejects(
    () => getToken(),
    (error: unknown) => {
      assert.ok(error instanceof module.MelhorEnvioTokenManagerError)
      assert.equal(error.code, "temporary_unavailable")
      return true
    },
  )
  assert.deepEqual(calls.releases, [
    {
      environment: "sandbox",
      expectedVersion: 4,
      leaseOwner: "lease-owner-uuid",
    },
  ])
  assert.equal(calls.marks.length, 0)
})

test("decryption failure fails closed without any legacy token fallback or secret leakage", async () => {
  const module = await loadManagerModule()
  const { deps, calls } = makeDeps({
    decryptToken: () => {
      throw new Error("ciphertext included secret-provider-token")
    },
  })
  const getToken = module.createMelhorEnvioTokenManager(deps)

  await assert.rejects(
    () => getToken(),
    (error: unknown) => {
      assert.ok(error instanceof module.MelhorEnvioTokenManagerError)
      assert.equal(error.code, "invalid_credential")
      assert.doesNotMatch(error.message, /secret-provider-token|ciphertext/)
      return true
    },
  )
  assert.equal(calls.claims.length, 0)
})
