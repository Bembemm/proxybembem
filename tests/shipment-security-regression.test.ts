import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { assertSafeMetadata } from "../lib/server/safe-metadata.ts"

const ROOT = fileURLToPath(new URL("../", import.meta.url))

async function source(relativePath: string) {
  return readFile(path.join(ROOT, relativePath), "utf8")
}

async function walk(relativeDirectory: string): Promise<string[]> {
  const absoluteDirectory = path.join(ROOT, relativeDirectory)
  const entries = await readdir(absoluteDirectory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(relativePath))
    else files.push(relativePath)
  }
  return files
}

function assertOrdered(sourceText: string, labels: Array<[string, RegExp]>) {
  let previous = -1
  for (const [label, pattern] of labels) {
    const match = pattern.exec(sourceText)
    assert.ok(match, `missing ${label}`)
    assert.ok((match.index ?? -1) > previous, `${label} is out of security order`)
    previous = match.index ?? previous
  }
}

test("prepare purchase generate post and cancel remain AAL2 active-admin server mutations", async () => {
  const routes = [
    ["prepare", "app/api/internal/admin/orders/[id]/shipment/prepare/route.ts", /prepareAdminShipment/],
    ["purchase", "app/api/internal/admin/shipments/[id]/purchase/route.ts", /purchaseAdminShipment/],
    ["generate", "app/api/internal/admin/shipments/[id]/generate/route.ts", /generateAdminShipment/],
    ["post", "app/api/internal/admin/shipments/[id]/post/route.ts", /postAdminShipment/],
    ["cancel", "app/api/internal/admin/shipments/[id]/cancel/route.ts", /cancelAdminShipment/],
  ] as const

  for (const [label, file, operation] of routes) {
    const text = await source(file)
    assert.match(text, /authorizeAdminAccess\(\{ touch: true \}\)/, `${label} must require touched admin auth`)
    assert.match(text, operation, `${label} must wire only its explicit operation`)
    assert.doesNotMatch(text, /getOptionalCustomerIdentity|requireCustomerPageAccess/, `${label} cannot use customer auth`)
  }
})

test("same-origin and rate-limit boundaries precede auth and mutation work", async () => {
  const sharedActions = await source("lib/server/admin-shipment-actions.ts")
  assertOrdered(sharedActions, [
    ["origin guard", /isAllowedCheckoutOrigin\(\{/],
    ["rate limit", /consumeRateLimit\(input\.request\)/],
    ["admin auth", /input\.authorizeAdmin\(\)/],
  ])
  assert.ok(sharedActions.indexOf("prepareShipment({") > sharedActions.indexOf("input.authorizeAdmin()"))
  assert.ok(sharedActions.indexOf("purchaseShipment({") > sharedActions.indexOf("input.authorizeAdmin()"))

  for (const [file, operation] of [
    ["app/api/internal/admin/shipments/[id]/generate/route.ts", "generateAdminShipment({"],
    ["app/api/internal/admin/shipments/[id]/post/route.ts", "postAdminShipment({"],
    ["app/api/internal/admin/shipments/[id]/cancel/route.ts", "cancelAdminShipment({"],
  ] as const) {
    const text = await source(file)
    assertOrdered(text, [
      ["origin guard", /isAllowedCheckoutOrigin\(\{/],
      ["rate limit", /consumeRateLimit\(\{/],
      ["admin auth", /authorizeAdminAccess\(\{ touch: true \}\)/],
      ["shipment mutation", new RegExp(operation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))],
    ])
  }
})

test("purchase keeps an independent spend rate-limit bucket", async () => {
  const [purchase, prepare] = await Promise.all([
    source("app/api/internal/admin/shipments/[id]/purchase/route.ts"),
    source("app/api/internal/admin/orders/[id]/shipment/prepare/route.ts"),
  ])

  assert.match(purchase, /scope:\s*"admin-shipping-spend"/)
  assert.doesNotMatch(purchase, /scope:\s*"admin-shipping-mutation"/)
  assert.match(prepare, /scope:\s*"admin-shipping-mutation"/)
})

test("customer shipment projection is an exact allowlist with no private shipment fields", async () => {
  const customerOrders = await source("lib/server/customer-orders.ts")
  const start = customerOrders.indexOf("export interface CustomerShipmentProjection")
  const end = customerOrders.indexOf("export interface CustomerOrderDetail", start)
  assert.ok(start >= 0 && end > start)
  const projection = customerOrders.slice(start, end)

  for (const allowed of ["carrierName", "serviceName", "trackingCode", "status", "updatedAt", "timeline"]) {
    assert.match(projection, new RegExp(`\\b${allowed}\\b`))
  }
  assert.doesNotMatch(
    projection,
    /cpf|cnpj|tax|cost|price|provider|token|print|dace|access|refresh|sender|document/i,
  )

  assert.match(
    customerOrders,
    /\["carrier_name", "service_name", "tracking_code", "status", "updated_at", "timeline"\]/,
  )
})

test("shipment runtime errors and logs never carry raw secret or sender metadata", async () => {
  const files = [
    "lib/server/shipment-lifecycle-service.ts",
    "lib/server/shipment-generation.ts",
    "lib/server/shipment-post-cancel.ts",
    "lib/server/shipment-tracking.ts",
    "lib/server/melhor-envio-shipment-client.ts",
    "lib/server/admin-shipment-actions.ts",
  ]

  for (const file of files) {
    const text = await source(file)
    assert.doesNotMatch(text, /console\.(?:log|warn|error)\s*\(/, `${file} must not log shipment payloads`)
    assert.doesNotMatch(text, /throw new Error\([^\n]*(?:cpf|cnpj|access[_ -]?token|refresh[_ -]?token|providerShipmentId)/i)
  }
})

test("safe metadata rejects shipment PII provider identifiers and transient document URLs", () => {
  for (const metadata of [
    { senderCpf: "12345678909" },
    { sender_cnpj: "12345678000195" },
    { taxId: "12345678909" },
    { providerShipmentId: "provider-shipment-1" },
    { provider_cart_id: "provider-cart-1" },
    { providerOrderId: "provider-order-1" },
    { printUrl: "https://example.invalid/private-label" },
    { dace_url: "https://example.invalid/private-dace" },
  ]) {
    assert.throws(() => assertSafeMetadata(metadata, "shipment metadata"), /unsafe metadata key/)
  }
})

test("client modules cannot import Melhor Envio credential internals or name raw tokens", async () => {
  const roots = ["app", "components", "contexts"]
  const candidates = (await Promise.all(roots.map(walk))).flat()
    .filter((file) => /\.(?:ts|tsx)$/.test(file))

  for (const file of candidates) {
    const text = await source(file)
    if (!/^\s*["']use client["']/m.test(text)) continue
    assert.doesNotMatch(
      text,
      /melhor-envio-(?:token-manager|oauth-repository|token-crypto)|getMelhorEnvioAccessToken|\baccessToken\b|\brefreshToken\b/,
      `${file} exposes a server credential boundary to client code`,
    )
  }
})
