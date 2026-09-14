import type { AdminAccessResult } from "./admin-auth.ts"
import {
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "./env.ts"
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  readJsonBody,
} from "./request-body.ts"
import { StoreSettingsConflictError } from "./store-settings.ts"
import {
  validateStoreSettingsMutationInput,
  type StoreSettings,
  type StoreSettingsMutationInput,
} from "../store-settings/store-settings.ts"

const BODY_LIMIT_BYTES = 16_384
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:z|[+-]\d{2}:\d{2})$/i

export interface AdminStoreSettingsRouteDependencies {
  authorizeAdmin(): Promise<AdminAccessResult>
  updateAdminStoreSettings(
    adminUserId: string,
    expectedUpdatedAt: string,
    input: StoreSettingsMutationInput,
  ): Promise<StoreSettings>
  invalidatePublicStoreSettings(): void | Promise<void>
}

function response(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  })
}

function adminFailureStatus(result: Exclude<AdminAccessResult, { ok: true }>) {
  if (result.reason === "unauthenticated" || result.reason === "mfa_required") {
    return 401
  }
  if (result.reason === "unavailable") return 503
  return 403
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isValidExpectedUpdatedAt(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 80 &&
    ISO_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  )
}

function isAllowedMutationOrigin(request: Request) {
  let requestOrigin: string
  let siteUrl: string

  try {
    requestOrigin = new URL(request.url).origin
    siteUrl = resolvePublicSiteUrl(requestOrigin)
  } catch {
    return false
  }

  return isAllowedCheckoutOrigin({
    originHeader: request.headers.get("origin"),
    configuredSiteUrl: siteUrl,
    requestOrigin,
    nodeEnv: process.env.NODE_ENV,
  })
}

export function createAdminStoreSettingsRouteHandler(
  deps: AdminStoreSettingsRouteDependencies,
) {
  return async function PATCH(request: Request) {
    if (!isAllowedMutationOrigin(request)) {
      return response({ error: "admin_access_denied" }, 403)
    }

    let auth: AdminAccessResult
    try {
      auth = await deps.authorizeAdmin()
    } catch {
      return response({ error: "admin_access_denied" }, 503)
    }

    if (!auth.ok) {
      return response({ error: "admin_access_denied" }, adminFailureStatus(auth))
    }

    let body: unknown
    try {
      body = await readJsonBody(request, BODY_LIMIT_BYTES)
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return response({ error: "invalid_request" }, 413)
      }
      if (error instanceof InvalidJsonBodyError) {
        return response({ error: "invalid_request" }, 400)
      }
      return response({ error: "invalid_request" }, 400)
    }

    if (!isRecord(body)) {
      return response(
        {
          error: "invalid_store_settings",
          fieldErrors: { _form: "Configurações inválidas." },
        },
        400,
      )
    }

    const { expectedUpdatedAt, ...mutationCandidate } = body
    const fieldErrors: Record<string, string> = {}

    if (!isValidExpectedUpdatedAt(expectedUpdatedAt)) {
      fieldErrors.expectedUpdatedAt = "Atualize a página e tente novamente."
    }

    const validation = validateStoreSettingsMutationInput(mutationCandidate)
    if (!validation.ok) Object.assign(fieldErrors, validation.fieldErrors)

    if (Object.keys(fieldErrors).length > 0 || !validation.ok) {
      return response({ error: "invalid_store_settings", fieldErrors }, 400)
    }

    let settings: StoreSettings
    try {
      settings = await deps.updateAdminStoreSettings(
        auth.principal.userId,
        expectedUpdatedAt as string,
        validation.value,
      )
    } catch (error) {
      if (error instanceof StoreSettingsConflictError) {
        return response({ error: "store_settings_conflict" }, 409)
      }
      return response({ error: "store_settings_unavailable" }, 503)
    }

    try {
      await deps.invalidatePublicStoreSettings()
    } catch {
      // The mutation is already durable. The five-minute public cache TTL remains
      // the safe fallback if immediate tag invalidation is temporarily unavailable.
    }

    return response({ settings }, 200)
  }
}
