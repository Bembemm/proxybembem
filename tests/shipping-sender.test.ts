import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

type Environment = "sandbox" | "production"

type SenderProfile = {
  id: string
  environment: Environment
  fullName: string
  cpf: string
  email: string
  phone: string
  postalCode: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  version: number
  updatedAt: string
}

type SenderModule = {
  ShippingSenderConflictError: new () => Error & { code?: string }
  getShippingSenderProfile(environment: Environment): Promise<SenderProfile | null>
  upsertShippingSenderProfile(input: {
    environment: Environment
    adminUserId: string
    expectedVersion: number | null
    fullName: string
    cpf: string
    email: string
    phone: string
    postalCode: string
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string
    state: string
  }): Promise<SenderProfile>
  maskCpf(cpf: string): string
}

const ADMIN_ID = "22222222-2222-4222-8222-222222222222"
const PROFILE_ID = "33333333-3333-4333-8333-333333333333"
const VALID_CPF = "52998224725"
const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const

async function loadSender(): Promise<SenderModule> {
  const url = new URL("../lib/server/shipping-sender.ts", import.meta.url).href
  return (await import(url)) as SenderModule
}

async function withSupabaseEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])
  process.env.SUPABASE_URL = "https://example.supabase.co"
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

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    environment: "production",
    person_type: "pf",
    full_name: "Breno Bembem",
    cpf: VALID_CPF,
    email: "contato@proxybembem.com.br",
    phone: "44999999999",
    postal_code: "86730000",
    street: "Rua do Remetente",
    number: "10",
    complement: null,
    neighborhood: "Centro",
    city: "Astorga",
    state: "PR",
    version: 3,
    updated_at: "2026-09-09T09:00:00.000Z",
    ...overrides,
  }
}

function mappedProfile(overrides: Partial<SenderProfile> = {}): SenderProfile {
  return {
    id: PROFILE_ID,
    environment: "production",
    fullName: "Breno Bembem",
    cpf: VALID_CPF,
    email: "contato@proxybembem.com.br",
    phone: "44999999999",
    postalCode: "86730000",
    street: "Rua do Remetente",
    number: "10",
    complement: null,
    neighborhood: "Centro",
    city: "Astorga",
    state: "PR",
    version: 3,
    updatedAt: "2026-09-09T09:00:00.000Z",
    ...overrides,
  }
}

test("reads one strict backend sender profile and masks CPF for presentation", async (t) => {
  await withSupabaseEnv(async () => {
    const sender = await loadSender()
    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = new URL(String(input))
      assert.equal(url.origin, "https://example.supabase.co")
      assert.equal(url.pathname, "/rest/v1/shipping_sender_profiles")
      assert.equal(url.searchParams.get("environment"), "eq.production")
      assert.equal(url.searchParams.get("limit"), "1")
      assert.match(url.searchParams.get("select") ?? "", /cpf/)
      assert.equal((init?.headers as Record<string, string>)?.apikey, "server-secret")
      assert.equal(init?.cache, "no-store")
      return Response.json([row()])
    })

    assert.deepEqual(await sender.getShippingSenderProfile("production"), mappedProfile())
    assert.equal(sender.maskCpf(VALID_CPF), "***.***.***-25")
    assert.equal(sender.maskCpf("529.982.247-25"), "***.***.***-25")
  })
})

test("returns null only for a missing environment profile and rejects malformed storage rows", async (t) => {
  await withSupabaseEnv(async () => {
    const sender = await loadSender()
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      if (calls === 1) return Response.json([])
      return Response.json([row({ cpf: "not-a-cpf" })])
    })

    assert.equal(await sender.getShippingSenderProfile("sandbox"), null)
    await assert.rejects(() => sender.getShippingSenderProfile("production"))
  })
})

test("upserts only through the service-role RPC with exact optimistic version input", async (t) => {
  await withSupabaseEnv(async () => {
    const sender = await loadSender()
    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(String(input), "https://example.supabase.co/rest/v1/rpc/admin_upsert_shipping_sender_profile")
      assert.equal(init?.method, "POST")
      assert.equal((init?.headers as Record<string, string>)?.apikey, "server-secret")
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_environment: "production",
        p_admin_user_id: ADMIN_ID,
        p_expected_version: 3,
        p_full_name: "Breno Bembem",
        p_cpf: VALID_CPF,
        p_email: "contato@proxybembem.com.br",
        p_phone: "44999999999",
        p_postal_code: "86730000",
        p_street: "Rua do Remetente",
        p_number: "10",
        p_complement: null,
        p_neighborhood: "Centro",
        p_city: "Astorga",
        p_state: "PR",
      })
      return Response.json({ outcome: "updated", profile: row({ version: 4 }) })
    })

    const result = await sender.upsertShippingSenderProfile({
      environment: "production",
      adminUserId: ADMIN_ID,
      expectedVersion: 3,
      fullName: "Breno Bembem",
      cpf: VALID_CPF,
      email: "contato@proxybembem.com.br",
      phone: "44999999999",
      postalCode: "86730000",
      street: "Rua do Remetente",
      number: "10",
      complement: null,
      neighborhood: "Centro",
      city: "Astorga",
      state: "PR",
    })

    assert.equal(result.version, 4)
    assert.equal(result.cpf, VALID_CPF)
  })
})

test("maps only the explicit RPC conflict outcome to a typed optimistic conflict", async (t) => {
  await withSupabaseEnv(async () => {
    const sender = await loadSender()
    t.mock.method(globalThis, "fetch", async () => Response.json({ outcome: "conflict" }))

    await assert.rejects(
      () => sender.upsertShippingSenderProfile({
        environment: "production",
        adminUserId: ADMIN_ID,
        expectedVersion: 3,
        fullName: "Breno Bembem",
        cpf: VALID_CPF,
        email: "contato@proxybembem.com.br",
        phone: "44999999999",
        postalCode: "86730000",
        street: "Rua do Remetente",
        number: "10",
        complement: null,
        neighborhood: "Centro",
        city: "Astorga",
        state: "PR",
      }),
      (error: unknown) => error instanceof sender.ShippingSenderConflictError && error.code === "sender_conflict",
    )
  })
})

test("sender upsert migration is fixed-search-path service-role only, versioned and never audits CPF values", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202609080003_shipments_foundation.sql", import.meta.url),
    "utf8",
  )

  assert.match(migration, /create or replace function public\.admin_upsert_shipping_sender_profile/i)
  assert.match(migration, /security definer/i)
  assert.match(migration, /set search_path\s*=\s*''/i)
  assert.match(migration, /for update/i)
  assert.match(migration, /p_expected_version/i)
  assert.match(migration, /version\s*=\s*[^,;]*version\s*\+\s*1/i)
  assert.match(migration, /insert into public\.admin_audit_log/i)
  assert.match(migration, /revoke all on function public\.admin_upsert_shipping_sender_profile[\s\S]*from public/i)
  assert.match(migration, /grant execute on function public\.admin_upsert_shipping_sender_profile[\s\S]*to service_role/i)

  const auditInsert = migration.match(/insert into public\.admin_audit_log[\s\S]*?;/i)?.[0] ?? ""
  assert.ok(auditInsert.length > 0)
  assert.doesNotMatch(auditInsert, /p_cpf|v_profile\.cpf|old_cpf|new_cpf/i)
})
