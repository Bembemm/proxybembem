import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const CRON_SECRET = "cron-secret-1234567890123456789012345678901234567890"

type HandlerDependencies = {
  getCronSecret(): string
  getAccessToken(): Promise<{ accessToken: string; tokenVersion: number }>
}
type CreateHandler = (deps: HandlerDependencies) => (request: Request) => Promise<Response>

async function loadCreateHandler(): Promise<CreateHandler> {
  const module = (await import(
    "../app/api/internal/melhor-envio/refresh/route.ts"
  )) as Record<string, unknown>
  assert.equal(
    typeof module.createMelhorEnvioRefreshHandler,
    "function",
    "createMelhorEnvioRefreshHandler must exist for deterministic cron security tests",
  )
  return module.createMelhorEnvioRefreshHandler as CreateHandler
}

function request(authorization?: string) {
  const headers = new Headers()
  if (authorization !== undefined) headers.set("authorization", authorization)
  return new Request("https://www.proxybembem.com.br/api/internal/melhor-envio/refresh", {
    method: "GET",
    headers,
  })
}

test("missing CRON_SECRET fails closed before invoking the token manager", async () => {
  let managerCalls = 0
  const createHandler = await loadCreateHandler()
  const handler = createHandler({
    getCronSecret: () => {
      throw new Error("CRON_SECRET missing")
    },
    getAccessToken: async () => {
      managerCalls += 1
      return { accessToken: "must-not-be-returned", tokenVersion: 1 }
    },
  })

  const response = await handler(request(`Bearer ${CRON_SECRET}`))
  assert.equal(response.status, 401)
  assert.equal(managerCalls, 0)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.doesNotMatch(await response.text(), /CRON_SECRET|must-not-be-returned/)
})

test("missing, malformed and wrong Authorization headers all return 401 without refresh", async () => {
  const createHandler = await loadCreateHandler()

  for (const authorization of [
    undefined,
    "",
    CRON_SECRET,
    `Basic ${CRON_SECRET}`,
    "Bearer ",
    "Bearer wrong-secret",
    `bearer ${CRON_SECRET}`,
    `Bearer ${CRON_SECRET} extra`,
  ]) {
    let managerCalls = 0
    const handler = createHandler({
      getCronSecret: () => CRON_SECRET,
      getAccessToken: async () => {
        managerCalls += 1
        return { accessToken: "must-not-be-returned", tokenVersion: 1 }
      },
    })

    const response = await handler(request(authorization))
    assert.equal(response.status, 401)
    assert.equal(managerCalls, 0)
    assert.doesNotMatch(await response.text(), /wrong-secret|must-not-be-returned/)
  }
})

test("correct Bearer secret invokes the shared token manager once and returns only ok", async () => {
  let managerCalls = 0
  const createHandler = await loadCreateHandler()
  const handler = createHandler({
    getCronSecret: () => CRON_SECRET,
    getAccessToken: async () => {
      managerCalls += 1
      return { accessToken: "maintenance-access-token", tokenVersion: 12 }
    },
  })

  const response = await handler(request(`Bearer ${CRON_SECRET}`))
  assert.equal(response.status, 200)
  assert.equal(managerCalls, 1)
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(response.headers.get("cache-control"), "no-store")
})

test("token-manager failures are sanitized and never expose token or provider details", async () => {
  const createHandler = await loadCreateHandler()
  const handler = createHandler({
    getCronSecret: () => CRON_SECRET,
    getAccessToken: async () => {
      throw new Error("provider rejected secret-token-value")
    },
  })

  const response = await handler(request(`Bearer ${CRON_SECRET}`))
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { ok: false })
  assert.doesNotMatch(JSON.stringify(await response.headers.entries()), /secret-token-value/)
})

test("Vercel registers exactly one daily Melhor Envio maintenance cron", async () => {
  const text = await readFile(new URL("../vercel.json", import.meta.url), "utf8")
  const config = JSON.parse(text) as {
    $schema?: unknown
    crons?: unknown
  }

  assert.equal(config.$schema, "https://openapi.vercel.sh/vercel.json")
  assert.deepEqual(config.crons, [
    {
      path: "/api/internal/melhor-envio/refresh",
      schedule: "17 3 * * *",
    },
  ])
})
