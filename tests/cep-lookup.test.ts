import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  CepNotFoundError,
  lookupBrazilianCep,
} from "../lib/server/cep-lookup.ts"

test("CEP lookup normalizes the CEP and returns only checkout address fields", async () => {
  let requestedUrl = ""
  let requestedInit: RequestInit | undefined

  const result = await lookupBrazilianCep(
    "01001-000",
    (async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(url)
      requestedInit = init
      return Response.json({
        cep: "01001-000",
        logradouro: "Praça da Sé",
        bairro: "Sé",
        localidade: "São Paulo",
        uf: "SP",
        ibge: "3550308",
        ddd: "11",
      })
    }) as typeof fetch,
  )

  assert.equal(requestedUrl, "https://viacep.com.br/ws/01001000/json/")
  assert.equal(requestedInit?.cache, "no-store")
  assert.deepEqual(result, {
    cep: "01001000",
    street: "Praça da Sé",
    neighborhood: "Sé",
    city: "São Paulo",
    state: "SP",
  })
})

test("CEP lookup rejects provider not-found responses", async () => {
  await assert.rejects(
    () =>
      lookupBrazilianCep(
        "99999-999",
        (async () => Response.json({ erro: true })) as typeof fetch,
      ),
    CepNotFoundError,
  )
})

test("checkout CEP endpoint stays same-origin, bounded, rate-limited and non-cacheable", async () => {
  const source = await readFile(
    new URL("../app/api/address/lookup/route.ts", import.meta.url),
    "utf8",
  )

  assert.match(source, /isAllowedCheckoutOrigin/)
  assert.match(source, /resolvePublicSiteUrl/)
  assert.match(source, /scope:\s*["']address-lookup["']/)
  assert.match(source, /readJsonBody\(request,\s*4_096\)/)
  assert.match(source, /Cache-Control["']?\s*:\s*["']no-store["']/)
  assert.match(source, /dynamic\s*=\s*["']force-dynamic["']/)
})
