import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { NextRequest } from "next/server.js"

type AdminAccessResult =
  | {
      ok: true
      principal: { userId: string; authSessionId: string; aal: "aal2" }
    }
  | { ok: false; reason: string }

type SenderProfile = {
  id: string
  environment: "sandbox" | "production"
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

type ActionModule = {
  createAdminShippingSenderActionHandler(deps: {
    authorizeAdmin(): Promise<AdminAccessResult>
    consumeRateLimit(request: NextRequest): Promise<boolean>
    getConfig(): { environment: "sandbox" | "production"; originCep: string }
    getSenderProfile(environment: "sandbox" | "production"): Promise<SenderProfile | null>
    upsertSenderProfile(input: Record<string, unknown>): Promise<SenderProfile>
  }): (request: NextRequest) => Promise<Response>
}

type SenderModule = {
  ShippingSenderConflictError: new () => Error
}

const ADMIN_ID = "22222222-2222-4222-8222-222222222222"
const AUTH_SESSION_ID = "33333333-3333-4333-8333-333333333333"
const PROFILE_ID = "44444444-4444-4444-8444-444444444444"
const VALID_CPF = "52998224725"
const ENV_KEYS = ["NEXT_PUBLIC_SITE_URL"] as const

async function loadAction(): Promise<ActionModule> {
  const url = new URL("../lib/server/admin-shipping-sender-action.ts", import.meta.url).href
  return (await import(url)) as ActionModule
}

async function loadSender(): Promise<SenderModule> {
  const url = new URL("../lib/server/shipping-sender.ts", import.meta.url).href
  return (await import(url)) as SenderModule
}

async function withPreviewEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])
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

function allowedPrincipal(): AdminAccessResult {
  return {
    ok: true,
    principal: { userId: ADMIN_ID, authSessionId: AUTH_SESSION_ID, aal: "aal2" },
  }
}

function profile(overrides: Partial<SenderProfile> = {}): SenderProfile {
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

function request(input: {
  origin?: string
  fields?: Record<string, string>
} = {}) {
  const body = new URLSearchParams({
    fullName: "  Breno Bembem  ",
    cpf: "529.982.247-25",
    email: " CONTATO@ProxyBembem.com.br ",
    phone: "(44) 99999-9999",
    postalCode: "86730-000",
    street: " Rua do Remetente ",
    number: " 10 ",
    complement: " ",
    neighborhood: " Centro ",
    city: " Astorga ",
    state: "pr",
    expectedVersion: "3",
    environment: "sandbox",
    ...input.fields,
  })

  return new NextRequest(
    "https://preview.example/api/internal/admin/integrations/melhor-envio/sender",
    {
      method: "POST",
      headers: {
        origin: input.origin ?? "https://preview.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
  )
}

function baseDeps(overrides: Partial<Parameters<ActionModule["createAdminShippingSenderActionHandler"]>[0]> = {}) {
  return {
    authorizeAdmin: async () => allowedPrincipal(),
    consumeRateLimit: async () => true,
    getConfig: () => ({ environment: "production" as const, originCep: "86730000" }),
    getSenderProfile: async () => profile(),
    upsertSenderProfile: async () => profile({ version: 4 }),
    ...overrides,
  }
}

function assertPrivateNoStore(response: Response) {
  assert.match(response.headers.get("cache-control") ?? "", /private/i)
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i)
}

test("rejects cross-site sender mutation before rate limit, admin auth or storage", async () => {
  await withPreviewEnv(async () => {
    const action = await loadAction()
    const calls: string[] = []
    const POST = action.createAdminShippingSenderActionHandler(baseDeps({
      consumeRateLimit: async () => {
        calls.push("rate")
        return true
      },
      authorizeAdmin: async () => {
        calls.push("auth")
        return allowedPrincipal()
      },
      getSenderProfile: async () => {
        calls.push("read")
        return profile()
      },
      upsertSenderProfile: async () => {
        calls.push("write")
        return profile()
      },
    }))

    const response = await POST(request({ origin: "https://evil.example" }))
    assert.equal(response.status, 403)
    assert.deepEqual(calls, [])
    assertPrivateNoStore(response)
  })
})

test("uses the dedicated config rate limit before admin authorization", async () => {
  await withPreviewEnv(async () => {
    const action = await loadAction()
    const calls: string[] = []
    const POST = action.createAdminShippingSenderActionHandler(baseDeps({
      consumeRateLimit: async () => {
        calls.push("rate")
        return false
      },
      authorizeAdmin: async () => {
        calls.push("auth")
        return allowedPrincipal()
      },
    }))

    const response = await POST(request())
    assert.equal(response.status, 429)
    assert.equal(response.headers.get("retry-after"), "600")
    assert.deepEqual(calls, ["rate"])
    assertPrivateNoStore(response)
  })
})

test("requires active AAL2 admin before reading or mutating sender storage", async () => {
  await withPreviewEnv(async () => {
    const action = await loadAction()
    for (const [reason, status] of [["unauthenticated", 401], ["mfa_required", 401], ["not_admin", 403], ["unavailable", 503]] as const) {
      let storageCalls = 0
      const POST = action.createAdminShippingSenderActionHandler(baseDeps({
        authorizeAdmin: async () => ({ ok: false as const, reason }),
        getSenderProfile: async () => {
          storageCalls += 1
          return null
        },
        upsertSenderProfile: async () => {
          storageCalls += 1
          return profile()
        },
      }))
      const response = await POST(request())
      assert.equal(response.status, status, reason)
      assert.equal(storageCalls, 0, reason)
      assertPrivateNoStore(response)
    }
  })
})

test("normalizes sender form fields and ignores browser environment overrides", async () => {
  await withPreviewEnv(async () => {
    const action = await loadAction()
    let written: Record<string, unknown> | null = null
    const POST = action.createAdminShippingSenderActionHandler(baseDeps({
      upsertSenderProfile: async (input) => {
        written = input
        return profile({ version: 4 })
      },
    }))

    const response = await POST(request())
    assert.equal(response.status, 303)
    assert.equal(response.headers.get("location"), "/admin/integrations/melhor-envio?status=sender-saved")
    assert.deepEqual(written, {
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
    assertPrivateNoStore(response)
  })
})

test("blank CPF on an optimistic edit reuses the server-side stored CPF without rendering it back", async () => {
  await withPreviewEnv(async () => {
    const action = await loadAction()
    let written: Record<string, unknown> | null = null
    const POST = action.createAdminShippingSenderActionHandler(baseDeps({
      upsertSenderProfile: async (input) => {
        written = input
        return profile({ version: 4 })
      },
    }))

    const response = await POST(request({ fields: { cpf: "" } }))
    assert.equal(response.status, 303)
    assert.ok(written !== null)
    assert.equal((written as Record<string, unknown>).cpf, VALID_CPF)
    assert.ok(!(await response.text()).includes(VALID_CPF))
    assert.ok(!(response.headers.get("location") ?? "").includes(VALID_CPF))
  })
})

test("rejects invalid CPF checksum, origin CEP mismatch and malformed bounded fields before upsert", async () => {
  await withPreviewEnv(async () => {
    const action = await loadAction()
    const invalidFields: Array<Record<string, string>> = [
      { cpf: "111.111.111-11" },
      { postalCode: "01001-000" },
      { state: "Parana" },
      { fullName: "x" },
      { phone: "123" },
      { email: "not-an-email" },
    ]
    for (const fields of invalidFields) {
      let writes = 0
      const POST = action.createAdminShippingSenderActionHandler(baseDeps({
        upsertSenderProfile: async () => {
          writes += 1
          return profile()
        },
      }))
      const response = await POST(request({ fields }))
      assert.equal(response.status, 303)
      assert.equal(response.headers.get("location"), "/admin/integrations/melhor-envio?status=sender-invalid")
      assert.equal(writes, 0)
      assert.ok(!(await response.text()).includes(VALID_CPF))
    }
  })
})

test("maps optimistic sender conflict to safe feedback and keeps all CPF values out of responses", async () => {
  await withPreviewEnv(async () => {
    const action = await loadAction()
    const sender = await loadSender()
    const POST = action.createAdminShippingSenderActionHandler(baseDeps({
      upsertSenderProfile: async () => {
        throw new sender.ShippingSenderConflictError()
      },
    }))

    const response = await POST(request())
    assert.equal(response.status, 303)
    assert.equal(response.headers.get("location"), "/admin/integrations/melhor-envio?status=sender-conflict")
    const serialized = `${await response.text()} ${[...response.headers].flat().join(" ")}`
    assert.ok(!serialized.includes(VALID_CPF))
    assert.ok(!serialized.includes("529.982.247-25"))
  })
})

test("production route wires touched admin auth and the admin-shipping-config rate bucket", async () => {
  const route = await readFile(
    new URL("../app/api/internal/admin/integrations/melhor-envio/sender/route.ts", import.meta.url),
    "utf8",
  ).catch(() => "")
  assert.match(route, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(route, /scope:\s*["']admin-shipping-config["']/)
  assert.match(route, /getMelhorEnvioShipmentEnv/)
})

test("admin integration UI shows environment, connection and masked sender state without embedding full CPF", async () => {
  const [page, form] = await Promise.all([
    readFile(new URL("../app/admin/integrations/melhor-envio/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/admin/melhor-envio-sender-form.tsx", import.meta.url), "utf8").catch(() => ""),
  ])
  const combined = `${page}\n${form}`
  assert.match(combined, /Ambiente|environment/i)
  assert.match(combined, /conectad|conex/i)
  assert.match(combined, /Remetente/i)
  assert.match(combined, /maskCpf|maskedCpf/i)
  assert.match(form, /expectedVersion/)
  assert.match(form, /name=["']cpf["']/)
  assert.doesNotMatch(form, /value=\{[^}]*\.cpf\}/)
  assert.doesNotMatch(combined, /52998224725|529\.982\.247-25/)
})
