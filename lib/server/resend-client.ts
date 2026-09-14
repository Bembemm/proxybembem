const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails"
const TRANSACTIONAL_FROM = "ProxyBembem <noreply@proxybembem.com.br>"
const PROVIDER_TIMEOUT_MS = 10_000
const PROVIDER_MESSAGE_ID_PATTERN = /^[^\u0000-\u001f\u007f]{1,128}$/

type ResendFailureCode =
  | "provider_rate_limited"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_network"
  | "provider_invalid_response"
  | "provider_rejected"

export type ResendEmailOutcome =
  | { outcome: "accepted"; messageId: string }
  | { outcome: "retryable"; code: ResendFailureCode }
  | { outcome: "rejected"; code: ResendFailureCode }

function requiredResendApiKey() {
  const value = process.env.RESEND_API_KEY?.trim()
  if (!value) {
    throw new Error("Missing transactional email provider configuration")
  }
  return value
}

function isAbortError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "AbortError",
  )
}

function parseProviderMessageId(value: unknown): string | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !PROVIDER_MESSAGE_ID_PATTERN.test(value.id)
  ) {
    return null
  }
  return value.id
}

export async function sendResendEmail(input: {
  to: string
  subject: string
  text: string
  html: string
  idempotencyKey?: string
}): Promise<ResendEmailOutcome> {
  const apiKey = requiredResendApiKey()
  const headers = new Headers({
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  })
  if (input.idempotencyKey) {
    headers.set("Idempotency-Key", input.idempotencyKey)
  }

  let response: Response
  try {
    response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: TRANSACTIONAL_FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })
  } catch (error) {
    if (isAbortError(error)) {
      return { outcome: "retryable", code: "provider_timeout" }
    }
    return { outcome: "retryable", code: "provider_network" }
  }

  if (response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      return { outcome: "retryable", code: "provider_invalid_response" }
    }
    const messageId = parseProviderMessageId(body)
    if (!messageId) {
      return { outcome: "retryable", code: "provider_invalid_response" }
    }
    return { outcome: "accepted", messageId }
  }

  if (response.status === 429) {
    return { outcome: "retryable", code: "provider_rate_limited" }
  }
  if (response.status >= 500 && response.status <= 599) {
    return { outcome: "retryable", code: "provider_unavailable" }
  }
  return { outcome: "rejected", code: "provider_rejected" }
}
