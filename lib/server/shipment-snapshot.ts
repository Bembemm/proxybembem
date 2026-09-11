import type { AdminOrderDetail } from "./admin-orders.ts"
import { hasValidCpfChecksum } from "./shipping-sender.ts"

export type ShipmentSnapshotErrorCode =
  | "order_not_ready"
  | "unsupported_shipping_provider"
  | "shipping_snapshot_invalid"
  | "shipping_package_snapshot_invalid"
  | "multiple_packages_not_supported"
  | "sender_origin_mismatch"
  | "recipient_invalid"
  | "recipient_matches_sender"
  | "declaration_invalid"

export class ShipmentSnapshotError extends Error {
  readonly code: ShipmentSnapshotErrorCode

  constructor(code: ShipmentSnapshotErrorCode) {
    super("Shipment snapshot validation failed")
    this.name = "ShipmentSnapshotError"
    this.code = code
  }
}

export interface ShippingSenderProfileInput {
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

export interface ShipmentPreparationSnapshot {
  service: {
    id: string
    name: string
    carrier: string
  }
  customerShippingCents: number
  recipient: {
    name: string
    email: string
    phone: string
    document: string
    postalCode: string
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string
    state: string
  }
  package: {
    height: number
    width: number
    length: number
    weight: number
    insuranceValueCents: number
  }
  declarationItems: Array<{
    productId: number
    description: string
    quantity: number
    unitValueCents: number
  }>
  declarationValueCents: number
}

function fail(code: ShipmentSnapshotErrorCode): never {
  throw new ShipmentSnapshotError(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function boundedTrimmedString(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    value === value.trim()
  )
}

function parsePositiveDecimal(value: unknown): number | null {
  if (isPositiveFiniteNumber(value)) return value
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parsePositiveMoneyCents(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null
    const cents = Math.round(value * 100)
    if (!Number.isSafeInteger(cents) || cents <= 0) return null
    if (Math.abs(value * 100 - cents) > 1e-7) return null
    return cents
  }

  if (typeof value !== "string") return null
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const reais = Number(match[1])
  const fraction = Number((match[2] ?? "").padEnd(2, "0") || "0")
  const cents = reais * 100 + fraction
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

function validateRecipient(order: AdminOrderDetail): ShipmentPreparationSnapshot["recipient"] {
  if (
    !boundedTrimmedString(order.customer_name, 120) ||
    !boundedTrimmedString(order.customer_email, 254) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.customer_email) ||
    typeof order.customer_cpf !== "string" ||
    !hasValidCpfChecksum(order.customer_cpf) ||
    !/^\d{10,15}$/.test(order.whatsapp) ||
    !/^\d{8}$/.test(order.cep) ||
    !boundedTrimmedString(order.address_street, 120) ||
    !boundedTrimmedString(order.address_number, 20) ||
    !(
      order.address_complement === null ||
      boundedTrimmedString(order.address_complement, 80)
    ) ||
    !boundedTrimmedString(order.address_neighborhood, 80) ||
    !boundedTrimmedString(order.address_city, 80) ||
    typeof order.address_state !== "string" ||
    !/^[A-Z]{2}$/.test(order.address_state)
  ) {
    fail("recipient_invalid")
  }

  return {
    name: order.customer_name,
    email: order.customer_email,
    phone: order.whatsapp,
    document: order.customer_cpf,
    postalCode: order.cep,
    street: order.address_street,
    number: order.address_number,
    complement: order.address_complement,
    neighborhood: order.address_neighborhood,
    city: order.address_city,
    state: order.address_state,
  }
}

function buildDeclaration(order: AdminOrderDetail) {
  if (!Array.isArray(order.items) || order.items.length < 1) {
    fail("declaration_invalid")
  }

  const seen = new Set<number>()
  let declarationValueCents = 0
  const declarationItems: ShipmentPreparationSnapshot["declarationItems"] = []

  for (const item of order.items) {
    if (
      !isPositiveSafeInteger(item.productId) ||
      seen.has(item.productId) ||
      !boundedTrimmedString(item.title, 500) ||
      !isPositiveSafeInteger(item.quantity) ||
      !isPositiveSafeInteger(item.unitPriceCents)
    ) {
      fail("declaration_invalid")
    }

    const lineValue = item.quantity * item.unitPriceCents
    if (!Number.isSafeInteger(lineValue) || lineValue <= 0) {
      fail("declaration_invalid")
    }
    declarationValueCents += lineValue
    if (!Number.isSafeInteger(declarationValueCents) || declarationValueCents <= 0) {
      fail("declaration_invalid")
    }

    seen.add(item.productId)
    declarationItems.push({
      productId: item.productId,
      description: item.title,
      quantity: item.quantity,
      unitValueCents: item.unitPriceCents,
    })
  }

  return { declarationItems, declarationValueCents }
}

function validateSavedProducts(
  value: unknown,
  order: AdminOrderDetail,
): Map<number, number> {
  if (!Array.isArray(value) || value.length !== order.items.length) {
    fail("shipping_snapshot_invalid")
  }

  const quantities = new Map<number, number>()
  for (const saved of value) {
    if (
      !isRecord(saved) ||
      !isPositiveSafeInteger(saved.productId) ||
      quantities.has(saved.productId) ||
      !isPositiveSafeInteger(saved.quantity) ||
      !isPositiveFiniteNumber(saved.widthCm) ||
      !isPositiveFiniteNumber(saved.heightCm) ||
      !isPositiveFiniteNumber(saved.lengthCm) ||
      !isPositiveFiniteNumber(saved.weightKg)
    ) {
      fail("shipping_snapshot_invalid")
    }

    const insuranceValueCents = parsePositiveMoneyCents(saved.insuranceValue)
    const item = order.items.find((candidate) => candidate.productId === saved.productId)
    if (
      insuranceValueCents === null ||
      !item ||
      item.quantity !== saved.quantity ||
      item.unitPriceCents !== insuranceValueCents ||
      item.shipping.widthCm !== saved.widthCm ||
      item.shipping.heightCm !== saved.heightCm ||
      item.shipping.lengthCm !== saved.lengthCm ||
      item.shipping.weightKg !== saved.weightKg
    ) {
      fail("shipping_snapshot_invalid")
    }

    quantities.set(saved.productId, saved.quantity)
  }

  return quantities
}

function validatePackageProducts(
  value: unknown,
  expectedQuantities: Map<number, number>,
) {
  if (!Array.isArray(value) || value.length !== expectedQuantities.size) {
    fail("shipping_snapshot_invalid")
  }

  const seen = new Set<number>()
  for (const product of value) {
    if (!isRecord(product) || !isPositiveSafeInteger(product.quantity)) {
      fail("shipping_snapshot_invalid")
    }

    const idValue = product.id
    const productId =
      typeof idValue === "number" && Number.isSafeInteger(idValue)
        ? idValue
        : typeof idValue === "string" && /^\d+$/.test(idValue)
          ? Number(idValue)
          : NaN

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      seen.has(productId) ||
      expectedQuantities.get(productId) !== product.quantity
    ) {
      fail("shipping_snapshot_invalid")
    }
    seen.add(productId)
  }
}

function parseSavedPackage(input: {
  packages: unknown
  declarationValueCents: number
  expectedQuantities: Map<number, number>
}): ShipmentPreparationSnapshot["package"] {
  if (!Array.isArray(input.packages) || input.packages.length < 1) {
    fail("shipping_package_snapshot_invalid")
  }
  if (input.packages.length > 1) {
    fail("multiple_packages_not_supported")
  }

  const saved = input.packages[0]
  if (!isRecord(saved) || !isRecord(saved.dimensions)) {
    fail("shipping_package_snapshot_invalid")
  }

  const height = saved.dimensions.height
  const width = saved.dimensions.width
  const length = saved.dimensions.length
  const weight = parsePositiveDecimal(saved.weight)
  const insuranceValueCents = parsePositiveMoneyCents(saved.insurance_value)

  if (
    !isPositiveFiniteNumber(height) ||
    !isPositiveFiniteNumber(width) ||
    !isPositiveFiniteNumber(length) ||
    weight === null ||
    insuranceValueCents === null
  ) {
    fail("shipping_package_snapshot_invalid")
  }

  if (insuranceValueCents !== input.declarationValueCents) {
    fail("shipping_snapshot_invalid")
  }
  validatePackageProducts(saved.products, input.expectedQuantities)

  return {
    height,
    width,
    length,
    weight,
    insuranceValueCents,
  }
}

export function buildShipmentPreparationSnapshot(input: {
  order: AdminOrderDetail
  sender: ShippingSenderProfileInput
  expectedOriginCep: string
}): ShipmentPreparationSnapshot {
  const { order, sender } = input

  if (order.payment_status !== "approved" || order.fulfillment_status !== "ready_to_ship") {
    fail("order_not_ready")
  }
  if (order.shipping_provider !== "melhor_envio") {
    fail("unsupported_shipping_provider")
  }
  if (
    !/^\d{8}$/.test(input.expectedOriginCep) ||
    sender.postalCode !== input.expectedOriginCep
  ) {
    fail("sender_origin_mismatch")
  }

  const recipient = validateRecipient(order)
  if (recipient.document === sender.cpf) {
    fail("recipient_matches_sender")
  }
  const { declarationItems, declarationValueCents } = buildDeclaration(order)

  const raw = order.shipping_snapshot
  if (!isRecord(raw) || !isRecord(raw.service)) {
    fail("shipping_snapshot_invalid")
  }

  if (
    raw.destinationCep !== order.cep ||
    !boundedTrimmedString(raw.service.id, 64) ||
    !boundedTrimmedString(raw.service.name, 120) ||
    !boundedTrimmedString(raw.service.carrier, 120) ||
    !isNonnegativeSafeInteger(raw.service.priceCents) ||
    !isNonnegativeSafeInteger(raw.service.deliveryDays) ||
    raw.service.id !== order.shipping_service_id ||
    raw.service.name !== order.shipping_service_name ||
    raw.service.carrier !== order.shipping_carrier_name ||
    raw.service.priceCents !== order.shipping_cents ||
    raw.service.deliveryDays !== order.shipping_delivery_days
  ) {
    fail("shipping_snapshot_invalid")
  }

  if (!isNonnegativeSafeInteger(order.shipping_cents)) {
    fail("shipping_snapshot_invalid")
  }

  const expectedQuantities = validateSavedProducts(raw.products, order)
  const packageSnapshot = parseSavedPackage({
    packages: raw.packages,
    declarationValueCents,
    expectedQuantities,
  })

  return {
    service: {
      id: raw.service.id,
      name: raw.service.name,
      carrier: raw.service.carrier,
    },
    customerShippingCents: order.shipping_cents,
    recipient,
    package: packageSnapshot,
    declarationItems,
    declarationValueCents,
  }
}
