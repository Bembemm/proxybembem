import { getSupabaseEnv } from "./env.ts"
import { assertSafeMetadata } from "./safe-metadata.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CODE_RE = /^[a-z][a-z0-9_]{2,63}$/
const AUDIT_SELECT =
  "id,admin_user_id,entity_type,entity_id,action,previous_values,new_values,metadata,created_at"

export interface AdminAuditRecord {
  id: string
  admin_user_id: string
  entity_type: string
  entity_id: string
  action: string
  previous_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  metadata: Record<string, unknown>
  created_at: string
}

function assertAdminUuid(value: string) {
  if (!UUID_RE.test(value)) throw new Error("invalid admin user id")
}

function assertCode(value: string, label: string) {
  if (!CODE_RE.test(value)) throw new Error(`invalid ${label}`)
}

function assertEntityId(value: string) {
  if (value.length < 1 || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("invalid audit entity id")
  }
}

function assertLimit(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("invalid audit limit")
  }
}

function assertOptionalValues(
  value: Record<string, unknown> | null | undefined,
  label: string,
) {
  if (value !== undefined && value !== null) {
    assertSafeMetadata(value, label)
  }
}

async function auditRequest(path: string, init?: RequestInit) {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: supabaseSecretKey,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Supabase admin audit request failed", {
      operation: init?.method ?? "GET",
      table: "admin_audit_log",
      status: "network",
    })
    throw new Error("Admin audit storage request failed")
  }

  if (!response.ok) {
    console.error("Supabase admin audit request failed", {
      operation: init?.method ?? "GET",
      table: "admin_audit_log",
      status: response.status,
    })
    throw new Error("Admin audit storage request failed")
  }

  return response
}

export async function appendAdminAudit(input: {
  adminUserId: string
  entityType: string
  entityId: string
  action: string
  previousValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}): Promise<AdminAuditRecord> {
  assertAdminUuid(input.adminUserId)
  assertCode(input.entityType, "audit entity type")
  assertEntityId(input.entityId)
  assertCode(input.action, "audit action")
  assertOptionalValues(input.previousValues, "previous values")
  assertOptionalValues(input.newValues, "new values")

  const metadata = input.metadata ?? {}
  assertSafeMetadata(metadata, "metadata")

  const params = new URLSearchParams({ select: AUDIT_SELECT })
  const response = await auditRequest(`admin_audit_log?${params.toString()}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      admin_user_id: input.adminUserId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      previous_values: input.previousValues ?? null,
      new_values: input.newValues ?? null,
      metadata,
    }),
  })

  const rows = (await response.json()) as unknown
  if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== "object") {
    throw new Error("Admin audit storage returned no audit row")
  }
  return rows[0] as AdminAuditRecord
}

export async function listAdminAuditForEntity(input: {
  entityType: string
  entityId: string
  limit?: number
}): Promise<AdminAuditRecord[]> {
  assertCode(input.entityType, "audit entity type")
  assertEntityId(input.entityId)
  const limit = input.limit ?? 100
  assertLimit(limit)

  const params = new URLSearchParams({
    entity_type: `eq.${input.entityType}`,
    entity_id: `eq.${input.entityId}`,
    select: AUDIT_SELECT,
    order: "created_at.desc",
    limit: String(limit),
  })
  const response = await auditRequest(`admin_audit_log?${params.toString()}`)
  const rows = (await response.json()) as unknown
  if (!Array.isArray(rows)) {
    throw new Error("Admin audit storage returned an invalid response")
  }
  return rows as AdminAuditRecord[]
}
