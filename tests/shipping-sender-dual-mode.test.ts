import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server.js"

type Environment = "sandbox" | "production"
type PersonType = "pf" | "pj"

type SenderProfile = {
  id: string
  environment: Environment
  personType: PersonType
  fullName: string
  cpf: string | null
  cnpj: string | null
  stateRegister: string | null
  economicActivityCode: string | null
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
  getShippingSenderProfile(environment: Environment, personType: PersonType): Promise<SenderProfile | null>
  upsertShippingSenderProfile(input: {
    environment: Environment
    adminUserId: string
    expectedVersion: number | null
    personType: PersonType
    fullName: string
    cpf: string | null
    cnpj: string | null
    stateRegister: string | null
    economicActivityCode: string | null
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
  maskCnpj(cnpj: string): string
}

type AdminAccessResult =
  | { ok: true; principal: { userId: string; authSessionId: string; aal: "aal2" } }
  | { ok: false; reason: string }

type ActionModule = {
  createAdminShippingSenderActionHandler(deps: {
    authorizeAdmin(): Promise<AdminAccessResult>
    consumeRateLimit(request: NextRequest): Promise<boolean>
    getConfig(): { environment: Environment; originCep: string }
    getSenderProfile(environment: Environment, personType: PersonType): Promise<SenderProfile | null>
    upsertSenderProfile(input: Record<string, unknown>): Promise<SenderProfile>
  }): (request: NextRequest) => Promise<Response>
}

const ADMIN_ID = "22222222-2222-4222-8222-222222222222"
const AUTH_SESSION_ID = "33333333-3333-4333-8333-333333333333"
const PROFILE_ID = "44444444-4444-4444-8444-444444444444"
const VALID_CNPJ = "46867029000176"
const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SITE_URL"] as const

async function withEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "server-secret"
  process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example"
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

function pjRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    environment: "production",
    person_type: "pj",
    full_name: "Proxy Bembem",
    cpf: null,
    cnpj: VALID_CNPJ,
    state_register: "123456789",
    economic_activity_code: null,
    email: "contato@proxybembem.com.br",
    phone: "44999999999",
    postal_code: "86730000",
    street: "Rua do Remetente",
    number: "10",
    complement: null,
    neighborhood: "Centro",
    city: "Astorga",
    state: "PR",
    version: 1,
    updated_at: "2026-09-09T09:00:00.000Z",
    ...overrides,
  }
}

function pjProfile(overrides: Partial<SenderProfile> = {}): SenderProfile {
  return {
    id: PROFILE_ID,
    environment: "production",
    personType: "pj",
    fullName: "Proxy Bembem",
    cpf: null,
    cnpj: VALID_CNPJ,
    stateRegister: "123456789",
    economicActivityCode: null,
    email: "contato@proxybembem.com.br",
    phone: "44999999999",
    postalCode: "86730000",
    street: "Rua do Remetente",
    number: "10",
    complement: null,
    neighborhood: "Centro",
    city: "Astorga",
    state: "PR",
    version: 1,
    updatedAt: "2026-09-09T09:00:00.000Z",
    ...overrides,
  }
}

test("repository reads and upserts an independent PJ/CNPJ sender profile", async (t) => {
  await withEnv(async () => {
    const module = (await import("../lib/server/shipping-sender.ts")) as unknown as SenderModule
    let calls = 0
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        calls += 1
        if (calls === 1) {
          const url = new URL(String(input))
          assert.equal(url.pathname, "/rest/v1/shipping_sender_profiles")
          assert.equal(url.searchParams.get("environment"), "eq.production")
          assert.equal(url.searchParams.get("person_type"), "eq.pj")
          assert.match(url.searchParams.get("select") ?? "", /cnpj/)
          assert.match(url.searchParams.get("select") ?? "", /state_register/)
          return Response.json([pjRow()])
        }

        assert.equal(
          String(input),
          "https://example.supabase.co/rest/v1/rpc/admin_upsert_shipping_sender_profile",
        )
        assert.equal(init?.method, "POST")
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_environment: "production",
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 1,
          p_person_type: "pj",
          p_full_name: "Proxy Bembem",
          p_cpf: null,
          p_cnpj: VALID_CNPJ,
          p_state_register: "123456789",
          p_economic_activity_code: null,
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
        return Response.json({ outcome: "updated", profile: pjRow({ version: 2 }) })
      },
    )

    assert.deepEqual(await module.getShippingSenderProfile("production", "pj"), pjProfile())
    const updated = await module.upsertShippingSenderProfile({
      environment: "production",
      adminUserId: ADMIN_ID,
      expectedVersion: 1,
      personType: "pj",
      fullName: "Proxy Bembem",
      cpf: null,
      cnpj: VALID_CNPJ,
      stateRegister: "123456789",
      economicActivityCode: null,
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
    assert.equal(updated.personType, "pj")
    assert.equal(updated.cnpj, VALID_CNPJ)
    assert.equal(module.maskCnpj(VALID_CNPJ), "**.***.***/****-76")
  })
})

test("admin sender action accepts PJ fields and ignores browser environment overrides", async () => {
  await withEnv(async () => {
    const action = (await import("../lib/server/admin-shipping-sender-action.ts")) as unknown as ActionModule
    let written: Record<string, unknown> | null = null
    const POST = action.createAdminShippingSenderActionHandler({
      authorizeAdmin: async () => ({
        ok: true,
        principal: { userId: ADMIN_ID, authSessionId: AUTH_SESSION_ID, aal: "aal2" },
      }),
      consumeRateLimit: async () => true,
      getConfig: () => ({ environment: "production", originCep: "86730000" }),
      getSenderProfile: async () => null,
      upsertSenderProfile: async (input) => {
        written = input
        return pjProfile()
      },
    })

    const body = new URLSearchParams({
      personType: "pj",
      fullName: " Proxy Bembem ",
      cpf: "",
      cnpj: "46.867.029/0001-76",
      stateRegister: "123456789",
      economicActivityCode: "",
      email: " CONTATO@PROXYBEMBEM.COM.BR ",
      phone: "(44) 99999-9999",
      postalCode: "86730-000",
      street: " Rua do Remetente ",
      number: " 10 ",
      complement: "",
      neighborhood: " Centro ",
      city: " Astorga ",
      state: "pr",
      expectedVersion: "",
      environment: "sandbox",
    })
    const response = await POST(
      new NextRequest(
        "https://preview.example/api/internal/admin/integrations/melhor-envio/sender",
        {
          method: "POST",
          headers: {
            origin: "https://preview.example",
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
        },
      ),
    )

    assert.equal(response.status, 303)
    assert.equal(response.headers.get("location"), "/admin/integrations/melhor-envio?status=sender-saved")
    assert.ok(written)
    assert.deepEqual(written, {
      environment: "production",
      adminUserId: ADMIN_ID,
      expectedVersion: null,
      personType: "pj",
      fullName: "Proxy Bembem",
      cpf: null,
      cnpj: VALID_CNPJ,
      stateRegister: "123456789",
      economicActivityCode: null,
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
  })
})
