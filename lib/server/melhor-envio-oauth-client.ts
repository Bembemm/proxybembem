import { getMelhorEnvioOAuthEnv } from "./env.ts"
import { melhorEnvioActiveScopeParameter } from "./melhor-envio-oauth-scopes.ts"

export interface MelhorEnvioOAuthTokens {
  tokenType: "Bearer"
  accessToken: string
  refreshToken: string
  expiresInSeconds: number
}

export type MelhorEnvioOAuthErrorClassification =
  | "unauthenticated"
  | "provider_error"
  | "invalid_response"

export class MelhorEnvioOAuthError extends Error {
  readonly status: number | null
  readonly classification: MelhorEnvioOAuthErrorClassification

  constructor(
    status: number | null,
    classification: MelhorEnvioOAuthErrorClassification,
  ) {
    super("Melhor Envio OAuth request failed")
    this.name = "MelhorEnvioOAuthError"
    this.status = status
    this.classification = classification
  }
}

const REQUEST_TIMEOUT_MS = 10_000
const MAX_TOKEN_LENGTH = 8192

function baseUrl(environment: "sandbox" | "production") {
  return environment === "sandbox"
    ? "https://sandbox.melhorenvio.com.br"
    : "https://melhorenvio.com.br"
}

function validNonEmptyToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_TOKEN_LENGTH
  )
}

function parseTokenResponse(
  payload: unknown,
  status: number,
): MelhorEnvioOAuthTokens {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MelhorEnvioOAuthError(status, "invalid_response")
  }

  const value = payload as Record<string, unknown>
  if (
    value.token_type !== "Bearer" ||
    !validNonEmptyToken(value.access_token) ||
    !validNonEmptyToken(value.refresh_token) ||
    typeof value.expires_in !== "number" ||
    !Number.isSafeInteger(value.expires_in) ||
    value.expires_in <= 0
  ) {
    throw new MelhorEnvioOAuthError(status, "invalid_response")
  }

  return {
    tokenType: "Bearer",
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    expiresInSeconds: value.expires_in,
  }
}

async function requestTokens(body: URLSearchParams): Promise<MelhorEnvioOAuthTokens> {
  const env = getMelhorEnvioOAuthEnv()
  let response: Response

  try {
    response = await fetch(`${baseUrl(env.environment)}/oauth/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": env.userAgent,
      },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new MelhorEnvioOAuthError(null, "provider_error")
  }

  if (!response.ok) {
    const classification: MelhorEnvioOAuthErrorClassification =
      response.status === 401 || response.status === 403
        ? "unauthenticated"
        : "provider_error"
    throw new MelhorEnvioOAuthError(response.status, classification)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new MelhorEnvioOAuthError(response.status, "invalid_response")
  }

  return parseTokenResponse(payload, response.status)
}

export function buildMelhorEnvioAuthorizationUrl(input: { state: string }) {
  const env = getMelhorEnvioOAuthEnv()
  const url = new URL("/oauth/authorize", baseUrl(env.environment))
  url.searchParams.set("client_id", env.clientId)
  url.searchParams.set("redirect_uri", env.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("state", input.state)
  url.searchParams.set("scope", melhorEnvioPhase5ScopeParameter())
  return url.toString()
}

export async function exchangeMelhorEnvioAuthorizationCode(
  code: string,
): Promise<MelhorEnvioOAuthTokens> {
  const env = getMelhorEnvioOAuthEnv()
  return requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      code,
    }),
  )
}

export async function refreshMelhorEnvioTokens(
  refreshToken: string,
): Promise<MelhorEnvioOAuthTokens> {
  const env = getMelhorEnvioOAuthEnv()
  return requestTokens(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
    }),
  )
}
