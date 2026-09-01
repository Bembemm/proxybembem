import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const CONFIG = new URL("../next.config.mjs", import.meta.url)

type HeaderEntry = {
  key: string
  value: string
}

type HeaderRule = {
  headers: HeaderEntry[]
}

async function cspForMelhorEnvioEnvironment(
  environment: string | undefined,
  nonce: string,
) {
  const previous = process.env.MELHOR_ENVIO_ENVIRONMENT
  if (environment === undefined) delete process.env.MELHOR_ENVIO_ENVIRONMENT
  else process.env.MELHOR_ENVIO_ENVIRONMENT = environment

  try {
    const configUrl = new URL(CONFIG)
    configUrl.searchParams.set("test-case", nonce)
    const loaded = (await import(configUrl.href)) as {
      default: { headers(): Promise<HeaderRule[]> }
    }
    const rules = await loaded.default.headers()
    const csp = rules[0]?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value
    assert.ok(csp)
    return csp
  } finally {
    if (previous === undefined) delete process.env.MELHOR_ENVIO_ENVIRONMENT
    else process.env.MELHOR_ENVIO_ENVIRONMENT = previous
  }
}

test("Next config defines the required security headers and a restrictive CSP", async () => {
  const source = await readFile(CONFIG, "utf8")

  assert.match(source, /Content-Security-Policy/)
  assert.match(source, /Strict-Transport-Security/)
  assert.match(source, /X-Content-Type-Options/)
  assert.match(source, /nosniff/)
  assert.match(source, /X-Frame-Options/)
  assert.match(source, /DENY/)
  assert.match(source, /Referrer-Policy/)
  assert.match(source, /strict-origin-when-cross-origin/)
  assert.match(source, /Permissions-Policy/)
  assert.match(source, /camera=\(\)/)
  assert.match(source, /microphone=\(\)/)
  assert.match(source, /geolocation=\(\)/)

  assert.match(source, /default-src 'self'/)
  assert.match(source, /frame-ancestors 'none'/)
  assert.match(source, /object-src 'none'/)
  assert.doesNotMatch(source, /unsafe-eval/)
  assert.doesNotMatch(source, /script-src[^;]*\*/)
})

test("Melhor Envio OAuth form navigation is allowlisted only for the active environment", async () => {
  const sandbox = await cspForMelhorEnvioEnvironment("sandbox", "sandbox")
  assert.match(
    sandbox,
    /form-action 'self' https:\/\/sandbox\.melhorenvio\.com\.br(?:;|$)/,
  )
  assert.doesNotMatch(sandbox, /form-action[^;]*\*/)
  assert.doesNotMatch(sandbox, /form-action[^;]* https:\/\/melhorenvio\.com\.br(?:;|$)/)

  const production = await cspForMelhorEnvioEnvironment(
    "production",
    "production",
  )
  assert.match(
    production,
    /form-action 'self' https:\/\/melhorenvio\.com\.br(?:;|$)/,
  )
  assert.doesNotMatch(production, /sandbox\.melhorenvio\.com\.br/)
  assert.doesNotMatch(production, /form-action[^;]*\*/)

  const invalid = await cspForMelhorEnvioEnvironment("invalid", "invalid")
  assert.match(invalid, /form-action 'self'(?:;|$)/)
  assert.doesNotMatch(invalid, /form-action[^;]*https:\/\//)
})

test("HSTS is conditionally enabled only for the production deployment", async () => {
  const source = await readFile(CONFIG, "utf8")
  assert.match(source, /VERCEL_ENV/)
  assert.match(source, /production/)
  assert.match(source, /max-age=31536000; includeSubDomains/)
})
