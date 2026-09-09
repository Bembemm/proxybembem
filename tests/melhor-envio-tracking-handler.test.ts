import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const CRON_SECRET = "cron-secret-1234567890123456789012345678901234567890"

type BatchResult = { checked: number; changed: number; attention: number }

type HandlerDependencies = {
  getCronSecret(): string
  refreshBatch(input: { limit: number }): Promise<BatchResult>
}

type HandlerModule = {
  createMelhorEnvioTrackingHandler(
    deps: HandlerDependencies,
  ): (request: Request) => Promise<Response>
}

async function loadModule(): Promise<HandlerModule> {
  const module = (await import(
    "../lib/server/melhor-envio-tracking-handler.ts"
  )) as Partial<HandlerModule>
  assert.equal(typeof module.createMelhorEnvioTrackingHandler, "function")
  return module as HandlerModule
}

function request(headers?: HeadersInit) {
  return new Request("https://proxybembem.com.br/api/internal/melhor-envio/tracking", {
    method: "GET",
    headers,
  })
}

test("tracking maintenance fails closed on missing or wrong CRON_SECRET before shipment reads", async () => {
  const module = await loadModule()
  for (const variant of [
    { headers: { authorization: `Bearer ${CRON_SECRET}` }, missingSecret: true },
    { headers: {}, missingSecret: false },
    { headers: { authorization: "Bearer wrong" }, missingSecret: false },
    { headers: { "x-cron-auth": "wrong" }, missingSecret: false },
  ]) {
    let refreshes = 0
    const handler = module.createMelhorEnvioTrackingHandler({
      getCronSecret: () => {
        if (variant.missingSecret) throw new Error("missing")
        return CRON_SECRET
      },
      refreshBatch: async () => {
        refreshes += 1
        return { checked: 1, changed: 1, attention: 0 }
      },
    })

    const response = await handler(request(variant.headers))
    assert.equal(response.status, 401)
    assert.equal(refreshes, 0)
    assert.deepEqual(await response.json(), { ok: false })
    assert.equal(response.headers.get("cache-control"), "no-store")
  }
})

test("manual Bearer and KingHost X-CRON-AUTH invoke one bounded hourly tracking batch", async () => {
  const module = await loadModule()
  for (const headers of [
    { authorization: `Bearer ${CRON_SECRET}` },
    { "x-cron-auth": CRON_SECRET },
  ]) {
    const inputs: Array<{ limit: number }> = []
    const handler = module.createMelhorEnvioTrackingHandler({
      getCronSecret: () => CRON_SECRET,
      refreshBatch: async (input) => {
        inputs.push(input)
        return { checked: 12, changed: 4, attention: 2 }
      },
    })

    const response = await handler(request(headers))
    assert.equal(response.status, 200)
    assert.deepEqual(inputs, [{ limit: 20 }])
    assert.deepEqual(await response.json(), {
      ok: true,
      checked: 12,
      changed: 4,
      attention: 2,
    })
    assert.equal(response.headers.get("cache-control"), "no-store")
  }
})

test("tracking handler exposes counts only and sanitizes failures", async () => {
  const module = await loadModule()
  const successful = module.createMelhorEnvioTrackingHandler({
    getCronSecret: () => CRON_SECRET,
    refreshBatch: async () => ({ checked: 2, changed: 1, attention: 1 }),
  })
  const success = await successful(request({ "x-cron-auth": CRON_SECRET }))
  const successText = await success.text()
  assert.equal(success.status, 200)
  assert.doesNotMatch(successText, /trackingCode|providerShipmentId|BR\d+|orderId|shipmentId/)

  const failing = module.createMelhorEnvioTrackingHandler({
    getCronSecret: () => CRON_SECRET,
    refreshBatch: async () => {
      throw new Error("provider shipment secret BR123456789BR")
    },
  })
  const failure = await failing(request({ authorization: `Bearer ${CRON_SECRET}` }))
  assert.equal(failure.status, 503)
  assert.deepEqual(await failure.json(), { ok: false })
  assert.doesNotMatch(JSON.stringify([...failure.headers]), /BR123456789BR|provider shipment secret/)
})

test("internal tracking route uses only the read-only tracking service and existing cron secret boundary", async () => {
  const route = await readFile(
    new URL("../app/api/internal/melhor-envio/tracking/route.ts", import.meta.url),
    "utf8",
  )
  assert.match(route, /runtime\s*=\s*["']nodejs["']/)
  assert.match(route, /createMelhorEnvioTrackingHandler/)
  assert.match(route, /getCronSecret/)
  assert.match(route, /refreshActiveShipmentTrackingBatch/)
  assert.match(route, /export\s+const\s+GET/)
  assert.doesNotMatch(
    route,
    /purchaseMelhorEnvioShipment|addShipmentToMelhorEnvioCart|generateMelhorEnvioShipment|cancelMelhorEnvioShipment|shipping-checkout|shipping-cancel/,
  )
})

test("tracking service source requests shipping-tracking only and never imports spending/mutation provider clients", async () => {
  const source = await readFile(
    new URL("../lib/server/shipment-tracking.ts", import.meta.url),
    "utf8",
  )
  assert.match(source, /trackMelhorEnvioShipments/)
  assert.match(source, /shipping-tracking/)
  assert.doesNotMatch(
    source,
    /purchaseMelhorEnvioShipment|addShipmentToMelhorEnvioCart|generateMelhorEnvioShipment|cancelMelhorEnvioShipment|shipping-checkout|shipping-cancel/,
  )
})
