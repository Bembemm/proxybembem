import { getSupabaseEnv, type MelhorEnvioEnvironment } from "./env.ts"

export type MelhorEnvioCredentialStatus = "active" | "reauthorization_required"

export interface MelhorEnvioCredentialRecord {
  environment: MelhorEnvioEnvironment
  accessTokenEnvelope: string
  refreshTokenEnvelope: string
  accessTokenExpiresAt: string
  tokenVersion: number
  status: MelhorEnvioCredentialStatus
  refreshLeaseOwner: string | null
  refreshLeaseExpiresAt: string | null
}

const REQUEST_TIMEOUT_MS = 10_000
const CREDENTIAL_SELECT = [
  "environment",
  "access_token_envelope",
  "refresh_token_envelope",
  "access_token_expires_at",
  "token_version",
  "status",
  "refresh_lease_owner",
  "refresh_lease_expires_at",
].join(",")

function repositoryRequestError() {
  return new Error("Melhor Envio OAuth repository request failed")
}

function repositoryResponseError() {
  return new Error("Invalid Melhor Envio OAuth repository response")
}

async function supabaseRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const env = getSupabaseEnv()
  const headers = new Headers(init.headers)
  headers.set("apikey", env.supabaseSecretKey)
  headers.set("Accept", "application/json")

  if (init.body !== undefined && init.body !== null) {
    headers.set("Content-Type", "application/json")
  }

  let response: Response
  try {
    response = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw repositoryRequestError()
  }

  if (!response.ok) {
    throw repositoryRequestError()
  }

  return response
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw repositoryResponseError()
  }
}

async function postRpc(path: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await supabaseRequest(`rpc/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  })
  return readJson(response)
}

function parseBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw repositoryResponseError()
  return value
}

function parsePositiveVersion(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw repositoryResponseError()
  }
  return value
}

function isValidIsoDate(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
}

function parseNullableString(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== "string" || value.length < 1 || value.length > 8192) {
    throw repositoryResponseError()
  }
  return value
}

function parseCredentialRow(
  value: unknown,
  expectedEnvironment: MelhorEnvioEnvironment,
): MelhorEnvioCredentialRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw repositoryResponseError()
  }

  const row = value as Record<string, unknown>
  const environment = row.environment
  const accessTokenEnvelope = row.access_token_envelope
  const refreshTokenEnvelope = row.refresh_token_envelope
  const accessTokenExpiresAt = row.access_token_expires_at
  const tokenVersion = row.token_version
  const status = row.status
  const refreshLeaseOwner = parseNullableString(row.refresh_lease_owner)
  const refreshLeaseExpiresAt = parseNullableString(row.refresh_lease_expires_at)

  if (environment !== expectedEnvironment) throw repositoryResponseError()
  if (
    typeof accessTokenEnvelope !== "string" ||
    accessTokenEnvelope.length < 1 ||
    accessTokenEnvelope.length > 8192
  ) {
    throw repositoryResponseError()
  }
  if (
    typeof refreshTokenEnvelope !== "string" ||
    refreshTokenEnvelope.length < 1 ||
    refreshTokenEnvelope.length > 8192
  ) {
    throw repositoryResponseError()
  }
  if (
    typeof accessTokenExpiresAt !== "string" ||
    !isValidIsoDate(accessTokenExpiresAt)
  ) {
    throw repositoryResponseError()
  }
  if (
    typeof tokenVersion !== "number" ||
    !Number.isSafeInteger(tokenVersion) ||
    tokenVersion <= 0
  ) {
    throw repositoryResponseError()
  }
  if (status !== "active" && status !== "reauthorization_required") {
    throw repositoryResponseError()
  }
  if ((refreshLeaseOwner === null) !== (refreshLeaseExpiresAt === null)) {
    throw repositoryResponseError()
  }
  if (refreshLeaseExpiresAt !== null && !isValidIsoDate(refreshLeaseExpiresAt)) {
    throw repositoryResponseError()
  }

  return {
    environment,
    accessTokenEnvelope,
    refreshTokenEnvelope,
    accessTokenExpiresAt,
    tokenVersion,
    status,
    refreshLeaseOwner,
    refreshLeaseExpiresAt,
  }
}

export async function createOAuthState(input: {
  stateHash: string
  environment: MelhorEnvioEnvironment
  expiresAt: string
}): Promise<void> {
  const headers = new Headers({ Prefer: "return=minimal" })
  await supabaseRequest("melhor_envio_oauth_states", {
    method: "POST",
    headers,
    body: JSON.stringify({
      state_hash: input.stateHash,
      environment: input.environment,
      expires_at: input.expiresAt,
    }),
  })
}

export async function consumeOAuthState(input: {
  stateHash: string
  environment: MelhorEnvioEnvironment
}): Promise<boolean> {
  return parseBoolean(
    await postRpc("consume_melhor_envio_oauth_state", {
      p_state_hash: input.stateHash,
      p_environment: input.environment,
    }),
  )
}

export async function loadCredential(
  environment: MelhorEnvioEnvironment,
): Promise<MelhorEnvioCredentialRecord | null> {
  const search = new URLSearchParams({
    select: CREDENTIAL_SELECT,
    environment: `eq.${environment}`,
    limit: "1",
  })
  const response = await supabaseRequest(
    `melhor_envio_oauth_credentials?${search.toString()}`,
    { method: "GET" },
  )
  const payload = await readJson(response)

  if (!Array.isArray(payload) || payload.length > 1) {
    throw repositoryResponseError()
  }
  if (payload.length === 0) return null
  return parseCredentialRow(payload[0], environment)
}

export async function upsertAuthorizedCredential(input: {
  environment: MelhorEnvioEnvironment
  accessTokenEnvelope: string
  refreshTokenEnvelope: string
  accessTokenExpiresAt: string
}): Promise<void> {
  parsePositiveVersion(
    await postRpc("upsert_melhor_envio_authorized_credential", {
      p_environment: input.environment,
      p_access_token_envelope: input.accessTokenEnvelope,
      p_refresh_token_envelope: input.refreshTokenEnvelope,
      p_access_token_expires_at: input.accessTokenExpiresAt,
    }),
  )
}

export async function claimRefreshLease(input: {
  environment: MelhorEnvioEnvironment
  expectedVersion: number
  leaseOwner: string
  leaseSeconds: number
}): Promise<boolean> {
  return parseBoolean(
    await postRpc("claim_melhor_envio_refresh_lease", {
      p_environment: input.environment,
      p_expected_version: input.expectedVersion,
      p_lease_owner: input.leaseOwner,
      p_lease_seconds: input.leaseSeconds,
    }),
  )
}

export async function commitRefresh(input: {
  environment: MelhorEnvioEnvironment
  expectedVersion: number
  leaseOwner: string
  accessTokenEnvelope: string
  refreshTokenEnvelope: string
  accessTokenExpiresAt: string
}): Promise<boolean> {
  return parseBoolean(
    await postRpc("commit_melhor_envio_refresh", {
      p_environment: input.environment,
      p_expected_version: input.expectedVersion,
      p_lease_owner: input.leaseOwner,
      p_access_token_envelope: input.accessTokenEnvelope,
      p_refresh_token_envelope: input.refreshTokenEnvelope,
      p_access_token_expires_at: input.accessTokenExpiresAt,
    }),
  )
}

export async function releaseRefreshLease(input: {
  environment: MelhorEnvioEnvironment
  expectedVersion: number
  leaseOwner: string
}): Promise<boolean> {
  return parseBoolean(
    await postRpc("release_melhor_envio_refresh_lease", {
      p_environment: input.environment,
      p_expected_version: input.expectedVersion,
      p_lease_owner: input.leaseOwner,
    }),
  )
}

export async function markReauthorizationRequired(input: {
  environment: MelhorEnvioEnvironment
  expectedVersion: number
  leaseOwner: string
  failureCode: string
}): Promise<boolean> {
  return parseBoolean(
    await postRpc("mark_melhor_envio_reauthorization_required", {
      p_environment: input.environment,
      p_expected_version: input.expectedVersion,
      p_lease_owner: input.leaseOwner,
      p_failure_code: input.failureCode,
    }),
  )
}
