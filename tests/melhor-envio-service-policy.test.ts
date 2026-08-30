import assert from "node:assert/strict"
import test from "node:test"

import { createMelhorEnvioQuoter } from "../lib/server/melhor-envio.ts"

const products = [
  {
    id: "1",
    widthCm: 19,
    heightCm: 4,
    lengthCm: 25,
    weightKg: 0.5,
    insuranceValue: 119.9,
    quantity: 1,
  },
]

function mixedServicesResponse() {
  return Response.json([
    {
      id: 1,
      name: "PAC",
      custom_price: "22.64",
      custom_delivery_time: 14,
      company: { name: "Correios" },
      packages: [],
    },
    {
      id: 2,
      name: "SEDEX",
      custom_price: "25.63",
      custom_delivery_time: 10,
      company: { name: "Correios" },
      packages: [],
    },
    {
      id: 3,
      name: ".Package",
      custom_price: "22.08",
      custom_delivery_time: 5,
      company: { name: "Jadlog" },
      packages: [],
    },
    {
      id: 4,
      name: ".Com",
      custom_price: "18.15",
      custom_delivery_time: 4,
      company: { name: "Jadlog" },
      packages: [],
    },
  ])
}

function dependencies(environment: "sandbox" | "production") {
  return {
    getConfig: () => ({
      environment,
      userAgent: "ProxyBembem (contato@proxybembem.com.br)",
      originCep: "86730000",
    }),
    getAccessToken: async () => ({ accessToken: "test-token", tokenVersion: 1 }),
  }
}

test("sandbox requests only its OAuth-test services and rejects other provider results", async (t) => {
  const quote = createMelhorEnvioQuoter(dependencies("sandbox"))
  let requestBody: Record<string, unknown> | null = null

  t.mock.method(globalThis, "fetch", async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return mixedServicesResponse()
  })

  const result = await quote({ destinationCep: "01001000", products })

  assert.equal(requestBody?.services, "3,4")
  assert.deepEqual(
    result.map((option) => option.serviceId),
    ["3", "4"],
  )
})

test("production requests and accepts only Correios PAC and SEDEX service ids", async (t) => {
  const quote = createMelhorEnvioQuoter(dependencies("production"))
  let requestBody: Record<string, unknown> | null = null

  t.mock.method(globalThis, "fetch", async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return mixedServicesResponse()
  })

  const result = await quote({ destinationCep: "01001000", products })

  assert.equal(requestBody?.services, "1,2")
  assert.deepEqual(
    result.map((option) => option.serviceId),
    ["1", "2"],
  )
})
