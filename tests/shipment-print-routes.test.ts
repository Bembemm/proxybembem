import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const SHIPMENT_ID = "11111111-1111-4111-8111-111111111111"
const ORDER_ID = "22222222-2222-4222-8222-222222222222"
const PROVIDER_ID = "6e1c864a-fe48-4ae7-baaa-d6e4888bafd1"

interface ShipmentLike {
  id: string
  orderId: string
  environment: "production" | "sandbox"
  provider: "melhor_envio"
  documentMode: "declaration_content" | "invoice"
  state: string
  providerShipmentId: string | null
  operationKind: string | null
  operationId: string | null
  version: number
}

interface PrintDependencies {
  getConfig(): { environment: "production" | "sandbox" }
  getShipment(shipmentId: string): Promise<ShipmentLike | null>
  getLabel(input: { providerShipmentId: string }): Promise<{ url: string }>
  getDace(input: {
    providerShipmentId: string
    format: "pdf" | "jpeg" | "zpl"
  }): Promise<{ url: string }>
}

type PrintResult =
  | { outcome: "ready"; shipmentId: string; orderId: string; url: string }
  | { outcome: string; shipmentId?: string; orderId?: string }

type Module = {
  createShipmentPrintService(deps: PrintDependencies): {
    getAdminShipmentPrintResource(input: {
      shipmentId: string
      resource: "label" | "dace"
      format?: "pdf" | "jpeg" | "zpl"
    }): Promise<PrintResult>
  }
}

async function loadModule(): Promise<Module> {
  const module = (await import("../lib/server/shipment-service.ts")) as Partial<Module>
  assert.equal(
    typeof module.createShipmentPrintService,
    "function",
    "Task 10 must export createShipmentPrintService",
  )
  return module as Module
}

function shipment(overrides: Partial<ShipmentLike> = {}): ShipmentLike {
  return {
    id: SHIPMENT_ID,
    orderId: ORDER_ID,
    environment: "production",
    provider: "melhor_envio",
    documentMode: "declaration_content",
    state: "generated",
    providerShipmentId: PROVIDER_ID,
    operationKind: null,
    operationId: null,
    version: 7,
    ...overrides,
  }
}

function baseDeps(overrides: Partial<PrintDependencies> = {}): PrintDependencies {
  return {
    getConfig: () => ({ environment: "production" }),
    getShipment: async () => shipment(),
    getLabel: async () => ({ url: "https://melhorenvio.com.br/imprimir/label/abc" }),
    getDace: async () => ({ url: "https://melhorenvio.com.br/imprimir/dace/pdf/abc" }),
    ...overrides,
  }
}

test("label print resource is available only for generated-or-later local shipment state", async () => {
  const module = await loadModule()
  let providerCalls = 0
  const blocked = module.createShipmentPrintService(
    baseDeps({
      getShipment: async () => shipment({ state: "purchased" }),
      getLabel: async () => {
        providerCalls += 1
        return { url: "https://melhorenvio.com.br/imprimir/label/abc" }
      },
    }),
  )

  assert.deepEqual(
    await blocked.getAdminShipmentPrintResource({ shipmentId: SHIPMENT_ID, resource: "label" }),
    { outcome: "invalid_state", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.equal(providerCalls, 0)

  const allowed = module.createShipmentPrintService(baseDeps())
  assert.deepEqual(
    await allowed.getAdminShipmentPrintResource({ shipmentId: SHIPMENT_ID, resource: "label" }),
    {
      outcome: "ready",
      shipmentId: SHIPMENT_ID,
      orderId: ORDER_ID,
      url: "https://melhorenvio.com.br/imprimir/label/abc",
    },
  )
})

test("DACE is restricted to declaration_content shipments and supports explicit bounded formats", async () => {
  const module = await loadModule()
  let daceCalls = 0
  const invoice = module.createShipmentPrintService(
    baseDeps({
      getShipment: async () => shipment({ documentMode: "invoice" }),
      getDace: async () => {
        daceCalls += 1
        return { url: "https://melhorenvio.com.br/imprimir/dace/pdf/abc" }
      },
    }),
  )

  assert.deepEqual(
    await invoice.getAdminShipmentPrintResource({
      shipmentId: SHIPMENT_ID,
      resource: "dace",
      format: "pdf",
    }),
    { outcome: "invalid_state", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.equal(daceCalls, 0)

  const formats: Array<"pdf" | "jpeg" | "zpl"> = ["pdf", "jpeg", "zpl"]
  for (const format of formats) {
    const seen: unknown[] = []
    const service = module.createShipmentPrintService(
      baseDeps({
        getDace: async (input) => {
          seen.push(input)
          return { url: `https://melhorenvio.com.br/imprimir/dace/${format}/abc` }
        },
      }),
    )
    const result = await service.getAdminShipmentPrintResource({
      shipmentId: SHIPMENT_ID,
      resource: "dace",
      format,
    })
    assert.equal(result.outcome, "ready")
    assert.deepEqual(seen, [{ providerShipmentId: PROVIDER_ID, format }])
  }
})

test("print resources reject non-Melhor Envio hosts and environment-confused URLs", async () => {
  const module = await loadModule()
  for (const url of [
    "https://evil.example/label.pdf",
    "https://melhorenvio.com.br.evil.example/label.pdf",
    "http://melhorenvio.com.br/label.pdf",
    "https://sandbox.melhorenvio.com.br/label.pdf",
  ]) {
    const service = module.createShipmentPrintService(
      baseDeps({ getLabel: async () => ({ url }) }),
    )
    assert.deepEqual(
      await service.getAdminShipmentPrintResource({ shipmentId: SHIPMENT_ID, resource: "label" }),
      { outcome: "invalid_resource", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
      url,
    )
  }

  const sandbox = module.createShipmentPrintService(
    baseDeps({
      getConfig: () => ({ environment: "sandbox" }),
      getShipment: async () => shipment({ environment: "sandbox" }),
      getLabel: async () => ({ url: "https://sandbox.melhorenvio.com.br/imprimir/label/abc" }),
    }),
  )
  assert.equal(
    (await sandbox.getAdminShipmentPrintResource({ shipmentId: SHIPMENT_ID, resource: "label" })).outcome,
    "ready",
  )
})

test("ordinary shipment persistence never stores print or DACE access URLs", async () => {
  const repository = new URL("../lib/server/shipments.ts", import.meta.url)
  const text = await readFile(repository, "utf8")
  assert.doesNotMatch(text, /print_url|label_url|dace_url/i)
})

test("generation route is explicit POST with AAL2 admin auth, same-origin protection and mutation rate limit", async () => {
  const route = new URL(
    "../app/api/internal/admin/shipments/[id]/generate/route.ts",
    import.meta.url,
  )
  const text = await readFile(route, "utf8")
  assert.match(text, /runtime\s*=\s*["']nodejs["']/)
  assert.match(text, /export\s+(?:async\s+function|const)\s+POST/)
  assert.doesNotMatch(text, /export\s+(?:async\s+function|const)\s+GET/)
  assert.match(text, /authorizeAdminAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(text, /isAllowedCheckoutOrigin/)
  assert.match(text, /admin-shipping-mutation/)
  assert.match(text, /generateAdminShipment/)
  assert.match(text, /no-store/i)
  assert.doesNotMatch(text, /shipping-checkout|purchaseMelhorEnvioShipment/)
})

test("protected label and DACE routes require admin auth, rate limit, no-store and transient redirect only", async () => {
  for (const [path, resource] of [
    ["../app/api/internal/admin/shipments/[id]/print-label/route.ts", "label"],
    ["../app/api/internal/admin/shipments/[id]/print-dace/route.ts", "dace"],
  ] as const) {
    const route = new URL(path, import.meta.url)
    const text = await readFile(route, "utf8")
    assert.match(text, /runtime\s*=\s*["']nodejs["']/, resource)
    assert.match(text, /authorizeAdminAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/, resource)
    assert.match(text, /consumeRateLimit/, resource)
    assert.match(text, /admin-shipping-mutation/, resource)
    assert.match(text, /getAdminShipmentPrintResource/, resource)
    assert.match(text, /Location/, resource)
    assert.match(text, /no-store/i, resource)
    assert.doesNotMatch(text, /mode:\s*["']public["']|accessToken|Authorization:\s*[`"']Bearer/, resource)
  }
})
