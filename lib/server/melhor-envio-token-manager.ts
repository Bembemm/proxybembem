import { randomUUID } from "node:crypto"
import { getMelhorEnvioOAuthEnv, type MelhorEnvioEnvironment } from "./env.ts"
import {
  MelhorEnvioOAuthError,
  refreshMelhorEnvioTokens,
  type MelhorEnvioOAuthTokens,
} from "./melhor-envio-oauth-client.ts"
import {
  claimRefreshLease,
  commitRefresh,
  loadCredential,
  markReauthorizationRequired,
  releaseRefreshLease,
  type MelhorEnvioCredentialRecord,
} from "./melhor-envio-oauth-repository.ts"
import {
  decryptMelhorEnvioToken,
  encryptMelhorEnvioToken,
  type MelhorEnvioTokenKind,
} from "./melhor-envio-token-crypto.ts"

export interface UsableMelhorEnvioAccessToken {
  accessToken: string
  tokenVersion: number
}

export type MelhorEnvioTokenManagerErrorCode =
  | "reauthorization_required"
  | "temporary_unavailable"
  | "invalid_credential"

export class MelhorEnvioTokenManagerError extends Error {
  readonly code: MelhorEnvioTokenManagerErrorCode

  constructor(code: MelhorEnvioTokenManagerErrorCode) {
    super("Melhor Envio authentication is unavailable")
    this.name = "MelhorEnvioTokenManagerError"
    this.code = code
  }
}

interface TokenManagerDependencies {
  getOAuthConfig(): {
    environment: MelhorEnvioEnvironment
    tokenEncryptionKey: string
  }
  loadCredential(
    environment: MelhorEnvioEnvironment,
  ): Promise<MelhorEnvioCredentialRecord | null>
  claimRefreshLease(input: {
    environment: MelhorEnvioEnvironment
    expectedVersion: number
    leaseOwner: string
    leaseSeconds: number
  }): Promise<boolean>
  commitRefresh(input: {
    environment: MelhorEnvioEnvironment
    expectedVersion: number
    leaseOwner: string
    accessTokenEnvelope: string
    refreshTokenEnvelope: string
    accessTokenExpiresAt: string
  }): Promise<boolean>
  releaseRefreshLease(input: {
    environment: MelhorEnvioEnvironment
    expectedVersion: number
    leaseOwner: string
  }): Promise<boolean>
  markReauthorizationRequired(input: {
    environment: MelhorEnvioEnvironment
    expectedVersion: number
    leaseOwner: string
    failureCode: string
  }): Promise<boolean>
  refreshTokens(refreshToken: string): Promise<MelhorEnvioOAuthTokens>
  encryptToken(input: {
    plaintext: string
    environment: MelhorEnvioEnvironment
    kind: MelhorEnvioTokenKind
    encryptionKeyHex: string
  }): string
  decryptToken(input: {
    envelope: string
    environment: MelhorEnvioEnvironment
    kind: MelhorEnvioTokenKind
    encryptionKeyHex: string
  }): string
  now(): number
  sleep(ms: number): Promise<void>
  randomUUID(): string
}

const DAY_MS = 24 * 60 * 60 * 1000
const PROACTIVE_REFRESH_MS = 7 * DAY_MS
const MIN_IMMEDIATE_VALIDITY_MS = 60 * 1000
const REFRESH_LEASE_SECONDS = 30
const LOSER_WAIT_INTERVAL_MS = 500
const LOSER_WAIT_ATTEMPTS = 10

function managerError(code: MelhorEnvioTokenManagerErrorCode): never {
  throw new MelhorEnvioTokenManagerError(code)
}

function parseExpiry(record: MelhorEnvioCredentialRecord) {
  const expiresAt = Date.parse(record.accessTokenExpiresAt)
  if (!Number.isFinite(expiresAt)) managerError("invalid_credential")
  return expiresAt
}

function ensureActive(record: MelhorEnvioCredentialRecord) {
  if (record.status !== "active") managerError("reauthorization_required")
}

function decryptAccess(
  deps: TokenManagerDependencies,
  config: ReturnType<TokenManagerDependencies["getOAuthConfig"]>,
  record: MelhorEnvioCredentialRecord,
): UsableMelhorEnvioAccessToken {
  try {
    return {
      accessToken: deps.decryptToken({
        envelope: record.accessTokenEnvelope,
        environment: config.environment,
        kind: "access",
        encryptionKeyHex: config.tokenEncryptionKey,
      }),
      tokenVersion: record.tokenVersion,
    }
  } catch {
    managerError("invalid_credential")
  }
}

async function waitForNewerCommittedToken(input: {
  deps: TokenManagerDependencies
  config: ReturnType<TokenManagerDependencies["getOAuthConfig"]>
  minimumVersion: number
}): Promise<UsableMelhorEnvioAccessToken> {
  for (let attempt = 0; attempt < LOSER_WAIT_ATTEMPTS; attempt += 1) {
    await input.deps.sleep(LOSER_WAIT_INTERVAL_MS)
    const record = await input.deps.loadCredential(input.config.environment)
    if (!record) continue
    ensureActive(record)

    if (record.tokenVersion <= input.minimumVersion) continue
    if (parseExpiry(record) <= input.deps.now() + MIN_IMMEDIATE_VALIDITY_MS) {
      continue
    }

    return decryptAccess(input.deps, input.config, record)
  }

  managerError("temporary_unavailable")
}

async function refreshAsWinner(input: {
  deps: TokenManagerDependencies
  config: ReturnType<TokenManagerDependencies["getOAuthConfig"]>
  record: MelhorEnvioCredentialRecord
  leaseOwner: string
}): Promise<UsableMelhorEnvioAccessToken> {
  let refreshToken: string
  try {
    refreshToken = input.deps.decryptToken({
      envelope: input.record.refreshTokenEnvelope,
      environment: input.config.environment,
      kind: "refresh",
      encryptionKeyHex: input.config.tokenEncryptionKey,
    })
  } catch {
    await input.deps.releaseRefreshLease({
      environment: input.config.environment,
      expectedVersion: input.record.tokenVersion,
      leaseOwner: input.leaseOwner,
    }).catch(() => false)
    managerError("invalid_credential")
  }

  let refreshed: MelhorEnvioOAuthTokens
  try {
    refreshed = await input.deps.refreshTokens(refreshToken)
  } catch (error) {
    if (
      error instanceof MelhorEnvioOAuthError &&
      error.classification === "unauthenticated"
    ) {
      const marked = await input.deps
        .markReauthorizationRequired({
          environment: input.config.environment,
          expectedVersion: input.record.tokenVersion,
          leaseOwner: input.leaseOwner,
          failureCode: "refresh_rejected",
        })
        .catch(() => false)

      if (marked) managerError("reauthorization_required")

      return waitForNewerCommittedToken({
        deps: input.deps,
        config: input.config,
        minimumVersion: input.record.tokenVersion,
      })
    }

    await input.deps.releaseRefreshLease({
      environment: input.config.environment,
      expectedVersion: input.record.tokenVersion,
      leaseOwner: input.leaseOwner,
    }).catch(() => false)
    managerError("temporary_unavailable")
  }

  let accessTokenEnvelope: string
  let refreshTokenEnvelope: string
  try {
    accessTokenEnvelope = input.deps.encryptToken({
      plaintext: refreshed.accessToken,
      environment: input.config.environment,
      kind: "access",
      encryptionKeyHex: input.config.tokenEncryptionKey,
    })
    refreshTokenEnvelope = input.deps.encryptToken({
      plaintext: refreshed.refreshToken,
      environment: input.config.environment,
      kind: "refresh",
      encryptionKeyHex: input.config.tokenEncryptionKey,
    })
  } catch {
    await input.deps.releaseRefreshLease({
      environment: input.config.environment,
      expectedVersion: input.record.tokenVersion,
      leaseOwner: input.leaseOwner,
    }).catch(() => false)
    managerError("invalid_credential")
  }

  const accessTokenExpiresAt = new Date(
    input.deps.now() + refreshed.expiresInSeconds * 1000,
  ).toISOString()

  let committed: boolean
  try {
    committed = await input.deps.commitRefresh({
      environment: input.config.environment,
      expectedVersion: input.record.tokenVersion,
      leaseOwner: input.leaseOwner,
      accessTokenEnvelope,
      refreshTokenEnvelope,
      accessTokenExpiresAt,
    })
  } catch {
    managerError("temporary_unavailable")
  }

  if (!committed) {
    return waitForNewerCommittedToken({
      deps: input.deps,
      config: input.config,
      minimumVersion: input.record.tokenVersion,
    })
  }

  return {
    accessToken: refreshed.accessToken,
    tokenVersion: input.record.tokenVersion + 1,
  }
}

export function createMelhorEnvioTokenManager(deps: TokenManagerDependencies) {
  return async function getAccessToken(options?: {
    forceRefresh?: boolean
    rejectedTokenVersion?: number
  }): Promise<UsableMelhorEnvioAccessToken> {
    const config = deps.getOAuthConfig()
    const forceRefresh = options?.forceRefresh === true
    const rejectedVersion = options?.rejectedTokenVersion

    if (
      forceRefresh &&
      (typeof rejectedVersion !== "number" ||
        !Number.isSafeInteger(rejectedVersion) ||
        rejectedVersion <= 0)
    ) {
      managerError("invalid_credential")
    }

    const record = await deps.loadCredential(config.environment)
    if (!record) managerError("reauthorization_required")
    ensureActive(record)

    const expiresAt = parseExpiry(record)

    if (forceRefresh) {
      const rejected = rejectedVersion as number

      if (record.tokenVersion > rejected) {
        if (expiresAt <= deps.now() + MIN_IMMEDIATE_VALIDITY_MS) {
          managerError("temporary_unavailable")
        }
        return decryptAccess(deps, config, record)
      }

      if (record.tokenVersion < rejected) {
        return waitForNewerCommittedToken({
          deps,
          config,
          minimumVersion: rejected,
        })
      }
    } else if (expiresAt > deps.now() + PROACTIVE_REFRESH_MS) {
      return decryptAccess(deps, config, record)
    }

    const leaseOwner = deps.randomUUID()
    let claimed: boolean
    try {
      claimed = await deps.claimRefreshLease({
        environment: config.environment,
        expectedVersion: record.tokenVersion,
        leaseOwner,
        leaseSeconds: REFRESH_LEASE_SECONDS,
      })
    } catch {
      managerError("temporary_unavailable")
    }

    if (!claimed) {
      if (!forceRefresh && expiresAt > deps.now() + MIN_IMMEDIATE_VALIDITY_MS) {
        return decryptAccess(deps, config, record)
      }

      return waitForNewerCommittedToken({
        deps,
        config,
        minimumVersion: forceRefresh
          ? (rejectedVersion as number)
          : record.tokenVersion,
      })
    }

    return refreshAsWinner({ deps, config, record, leaseOwner })
  }
}

const defaultDependencies: TokenManagerDependencies = {
  getOAuthConfig: () => {
    const env = getMelhorEnvioOAuthEnv()
    return {
      environment: env.environment,
      tokenEncryptionKey: env.tokenEncryptionKey,
    }
  },
  loadCredential,
  claimRefreshLease,
  commitRefresh,
  releaseRefreshLease,
  markReauthorizationRequired,
  refreshTokens: refreshMelhorEnvioTokens,
  encryptToken: encryptMelhorEnvioToken,
  decryptToken: decryptMelhorEnvioToken,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  randomUUID,
}

export const getMelhorEnvioAccessToken =
  createMelhorEnvioTokenManager(defaultDependencies)
