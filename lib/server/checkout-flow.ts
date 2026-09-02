import { randomBytes, randomUUID } from "node:crypto"
import {
  normalizeCheckoutData,
  validateCheckout,
  type CheckoutData,
} from "../checkout.ts"
import { buildCheckoutOrder } from "./checkout-order.ts"
import { selectMercadoPagoCheckoutUrl, type MercadoPagoEnvironment } from "./checkout-url.ts"
import { createCheckoutFingerprint, parseCheckoutAttemptId } from "./checkout-idempotency.ts"
import {
  claimCheckoutPreference,
  completeCheckoutPreference,
  markCheckoutPreferenceError,
  type CheckoutPreferenceClaim,
} from "./checkout-preference-lease.ts"
import type { CustomerIdentity } from "./customer-auth.ts"
import { getMelhorEnvioEnv } from "./env.ts"
import {
  createMercadoPagoPreference,
  type MercadoPagoPreference,
} from "./mercadopago.ts"
import {
  createOrder,
  getOrderByCheckoutAttemptId,
  OrderConflictError,
  updateOrderByNumber,
  type CreateOrderInput,
} from "./orders.ts"
import {
  buildShippingQuoteResult,
  type PublicShippingOption,
  type ShippingQuoteResult,
} from "./shipping-quote.ts"
import {
  createCartFingerprint,
  verifyShippingQuoteToken,
} from "./shipping-quote-token.ts"

export class CheckoutFlowValidationError extends Error {
  constructor(message = "Invalid checkout data") {
    super(message)
    this.name = "CheckoutFlowValidationError"
  }
}

export class CheckoutFlowProviderError extends Error {
  constructor() {
    super("Checkout provider unavailable")
    this.name = "CheckoutFlowProviderError"
  }
}

interface AttemptOrderView {
  orderNumber: string
  publicToken: string
  checkoutFingerprint: string | null
  checkoutUrl: string | null
}

interface PreferenceInput {
  accessToken: string
  orderNumber: string
  items: ReturnType<typeof buildCheckoutOrder>["items"]
  shipping: {
    serviceName: string
    carrierName: string
    amountCents: number
  }
  notificationUrl: string
  returnUrl: string
  payerName: string
}

interface OrderUpdatePatch {
  preference_id?: string
  checkout_url?: string
  payment_status?: string
  payment_status_detail?: string | null
}

export interface CheckoutFlowDependencies {
  quoteSecret: string
  nowMs: () => number
  buildQuote: (input: {
    items: unknown
    destinationCep: string
  }) => Promise<ShippingQuoteResult>
  findOrderByAttempt: (attemptId: string) => Promise<AttemptOrderView | null>
  reserveOrder: (input: CreateOrderInput) => Promise<AttemptOrderView>
  updateOrder: (orderNumber: string, patch: OrderUpdatePatch) => Promise<void>
  createPreference: (input: PreferenceInput) => Promise<MercadoPagoPreference>
  selectCheckoutUrl: (
    preference: MercadoPagoPreference,
    environment: MercadoPagoEnvironment,
  ) => string
  generateOrderNumber: () => string
  generatePublicToken: () => string
  claimPreference?: (input: {
    orderNumber: string
    checkoutFingerprint: string
    leaseId: string
  }) => Promise<CheckoutPreferenceClaim>
  completePreference?: (input: {
    orderNumber: string
    checkoutFingerprint: string
    leaseId: string
    preferenceId: string
    checkoutUrl: string
  }) => Promise<boolean>
  markPreferenceError?: (input: {
    orderNumber: string
    leaseId: string
  }) => Promise<boolean>
  generateLeaseId?: () => string
  sleep?: (milliseconds: number) => Promise<void>
}

export interface CheckoutFlowInput {
  items: unknown
  customer: CheckoutData
  customerIdentity?: CustomerIdentity | null
  selectedQuoteToken: string
  checkoutAttemptId: string
  siteUrl: string
  mercadoPagoAccessToken: string
  mercadoPagoEnvironment: MercadoPagoEnvironment
}

export type CheckoutFlowResult =
  | {
      kind: "created" | "reused"
      checkoutUrl: string
      orderNumber: string
    }
  | {
      kind: "shipping_changed"
      options: PublicShippingOption[]
    }
  | {
      kind: "attempt_conflict"
    }

function publicOptions(result: ShippingQuoteResult): PublicShippingOption[] {
  return result.options.map((option) => ({
    serviceId: option.serviceId,
    serviceName: option.serviceName,
    carrierName: option.carrierName,
    priceCents: option.priceCents,
    deliveryDays: option.deliveryDays,
    quoteToken: option.quoteToken,
  }))
}

function toAttemptOrder(order: {
  order_number: string
  public_token: string
  checkout_fingerprint: string | null
  checkout_url: string | null
}): AttemptOrderView {
  return {
    orderNumber: order.order_number,
    publicToken: order.public_token,
    checkoutFingerprint: order.checkout_fingerprint,
    checkoutUrl: order.checkout_url,
  }
}

function createDefaultDependencies(): CheckoutFlowDependencies {
  return {
    quoteSecret: getMelhorEnvioEnv().quoteSecret,
    nowMs: () => Date.now(),
    buildQuote: buildShippingQuoteResult,
    findOrderByAttempt: async (attemptId) => {
      const order = await getOrderByCheckoutAttemptId(attemptId)
      return order ? toAttemptOrder(order) : null
    },
    reserveOrder: async (input) => toAttemptOrder(await createOrder(input)),
    updateOrder: async (orderNumber, patch) => {
      await updateOrderByNumber(orderNumber, patch)
    },
    createPreference: createMercadoPagoPreference,
    selectCheckoutUrl: selectMercadoPagoCheckoutUrl,
    generateOrderNumber: () => `PB-${randomBytes(6).toString("hex").toUpperCase()}`,
    generatePublicToken: () => randomBytes(32).toString("hex"),
    claimPreference: claimCheckoutPreference,
    completePreference: completeCheckoutPreference,
    markPreferenceError: markCheckoutPreferenceError,
    generateLeaseId: () => randomUUID(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }
}

function validateInput(input: CheckoutFlowInput) {
  if (
    typeof input.selectedQuoteToken !== "string" ||
    !input.selectedQuoteToken ||
    typeof input.siteUrl !== "string" ||
    !input.siteUrl
  ) {
    throw new CheckoutFlowValidationError()
  }

  const attemptId = parseCheckoutAttemptId(input.checkoutAttemptId)
  if (!attemptId) throw new CheckoutFlowValidationError("Invalid checkout attempt")

  const customer = normalizeCheckoutData(input.customer)
  if (Object.keys(validateCheckout(customer)).length > 0) {
    throw new CheckoutFlowValidationError("Invalid customer data")
  }

  const customerIdentity = input.customerIdentity ?? null
  if (customerIdentity && customer.email !== customerIdentity.email) {
    throw new CheckoutFlowValidationError("Authenticated email mismatch")
  }

  return { attemptId, customer, customerIdentity }
}

function existingAttemptResult(
  existing: AttemptOrderView,
  checkoutFingerprint: string,
): CheckoutFlowResult | null {
  if (existing.checkoutFingerprint !== checkoutFingerprint) {
    return { kind: "attempt_conflict" }
  }
  if (existing.checkoutUrl) {
    return {
      kind: "reused",
      checkoutUrl: existing.checkoutUrl,
      orderNumber: existing.orderNumber,
    }
  }
  return null
}

async function waitForConcurrentPreference(input: {
  deps: CheckoutFlowDependencies
  attemptId: string
  checkoutFingerprint: string
}): Promise<CheckoutFlowResult | null> {
  const sleep = input.deps.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))

  for (let attempt = 0; attempt < 50; attempt += 1) {
    await sleep(100)
    const order = await input.deps.findOrderByAttempt(input.attemptId)
    if (!order) continue
    const resolved = existingAttemptResult(order, input.checkoutFingerprint)
    if (resolved) return resolved
  }

  return null
}

export async function executeCheckoutFlow(
  input: CheckoutFlowInput,
  dependencies?: CheckoutFlowDependencies,
): Promise<CheckoutFlowResult> {
  const deps = dependencies ?? createDefaultDependencies()
  const { attemptId, customer, customerIdentity } = validateInput(input)
  const checkoutOrder = buildCheckoutOrder(input.items)
  const cartFingerprint = createCartFingerprint(
    checkoutOrder.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
  )

  const quoteClaims = verifyShippingQuoteToken(
    input.selectedQuoteToken,
    deps.quoteSecret,
    deps.nowMs(),
  )
  if (
    !quoteClaims ||
    quoteClaims.cartFingerprint !== cartFingerprint ||
    quoteClaims.destinationCep !== customer.cep
  ) {
    throw new CheckoutFlowValidationError("Invalid shipping quote")
  }

  const freshQuote = await deps.buildQuote({
    items: input.items,
    destinationCep: customer.cep,
  })
  if (freshQuote.cartFingerprint !== cartFingerprint) {
    throw new CheckoutFlowValidationError("Cart changed during shipping quote")
  }

  const selectedShipping = freshQuote.options.find(
    (option) => option.serviceId === quoteClaims.serviceId,
  )
  if (!selectedShipping || selectedShipping.priceCents !== quoteClaims.priceCents) {
    return {
      kind: "shipping_changed",
      options: publicOptions(freshQuote),
    }
  }

  const checkoutFingerprint = createCheckoutFingerprint({
    cartFingerprint,
    customer,
    quoteClaims,
  })

  const existing = await deps.findOrderByAttempt(attemptId)
  if (existing) {
    const resolved = existingAttemptResult(existing, checkoutFingerprint)
    if (resolved) return resolved
  }

  const totalCents = checkoutOrder.subtotalCents + selectedShipping.priceCents
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new CheckoutFlowValidationError("Invalid checkout total")
  }

  const trustedShippingProducts = checkoutOrder.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    widthCm: item.shipping.widthCm,
    heightCm: item.shipping.heightCm,
    lengthCm: item.shipping.lengthCm,
    weightKg: item.shipping.weightKg,
    insuranceValue: item.unitPriceCents / 100,
  }))

  let reserved = existing
  if (!reserved) {
    const reservationInput: CreateOrderInput = {
      orderNumber: deps.generateOrderNumber(),
      publicToken: deps.generatePublicToken(),
      customerName: customer.nome,
      customerEmail: customerIdentity?.email ?? customer.email,
      customerId: customerIdentity?.userId ?? null,
      whatsapp: customer.whatsapp,
      cep: customer.cep,
      address: {
        street: customer.rua,
        number: customer.numero,
        complement: customer.complemento,
        neighborhood: customer.bairro,
        city: customer.cidade,
        state: customer.uf,
      },
      items: checkoutOrder.items,
      subtotalCents: checkoutOrder.subtotalCents,
      shipping: {
        provider: "melhor_envio",
        serviceId: selectedShipping.serviceId,
        serviceName: selectedShipping.serviceName,
        carrierName: selectedShipping.carrierName,
        deliveryDays: selectedShipping.deliveryDays,
        amountCents: selectedShipping.priceCents,
        snapshot: {
          destinationCep: customer.cep,
          service: {
            id: selectedShipping.serviceId,
            name: selectedShipping.serviceName,
            carrier: selectedShipping.carrierName,
            priceCents: selectedShipping.priceCents,
            deliveryDays: selectedShipping.deliveryDays,
          },
          packages: selectedShipping.packages,
          products: trustedShippingProducts,
        },
      },
      totalCents,
      checkoutAttemptId: attemptId,
      checkoutFingerprint,
    }

    try {
      reserved = await deps.reserveOrder(reservationInput)
    } catch (error) {
      if (!(error instanceof OrderConflictError)) throw error
      const concurrent = await deps.findOrderByAttempt(attemptId)
      if (!concurrent) throw error
      const resolved = existingAttemptResult(concurrent, checkoutFingerprint)
      if (resolved) return resolved
      reserved = concurrent
    }
  }

  const orderNumber = reserved.orderNumber
  const returnUrl = `${input.siteUrl}/pedido/${reserved.publicToken}`
  const leaseId = (deps.generateLeaseId ?? (() => randomUUID()))()
  const claimPreference = deps.claimPreference ?? (async () => ({ outcome: "claimed" as const }))

  let claim: CheckoutPreferenceClaim
  try {
    claim = await claimPreference({
      orderNumber,
      checkoutFingerprint,
      leaseId,
    })
  } catch {
    throw new CheckoutFlowProviderError()
  }

  if (claim.outcome === "conflict") {
    return { kind: "attempt_conflict" }
  }
  if (claim.outcome === "not_found") {
    throw new CheckoutFlowProviderError()
  }
  if (claim.outcome === "ready") {
    return {
      kind: "reused",
      checkoutUrl: claim.checkoutUrl,
      orderNumber,
    }
  }
  if (claim.outcome === "busy") {
    const concurrentResult = await waitForConcurrentPreference({
      deps,
      attemptId,
      checkoutFingerprint,
    })
    if (concurrentResult) return concurrentResult
    throw new CheckoutFlowProviderError()
  }

  try {
    const preference = await deps.createPreference({
      accessToken: input.mercadoPagoAccessToken,
      orderNumber,
      items: checkoutOrder.items,
      shipping: {
        serviceName: selectedShipping.serviceName,
        carrierName: selectedShipping.carrierName,
        amountCents: selectedShipping.priceCents,
      },
      notificationUrl: `${input.siteUrl}/api/mercadopago/webhook`,
      returnUrl,
      payerName: customer.nome,
    })

    const checkoutUrl = deps.selectCheckoutUrl(
      preference,
      input.mercadoPagoEnvironment,
    )

    let completed = true
    if (deps.completePreference) {
      completed = await deps.completePreference({
        orderNumber,
        checkoutFingerprint,
        leaseId,
        preferenceId: preference.id,
        checkoutUrl,
      })
    } else {
      await deps.updateOrder(orderNumber, {
        preference_id: preference.id,
        checkout_url: checkoutUrl,
        payment_status: "pending",
        payment_status_detail: null,
      })
    }

    if (!completed) {
      const concurrent = await deps.findOrderByAttempt(attemptId)
      if (concurrent) {
        const resolved = existingAttemptResult(concurrent, checkoutFingerprint)
        if (resolved) return resolved
      }
      throw new Error("Checkout preference lease completion failed")
    }

    return {
      kind: "created",
      checkoutUrl,
      orderNumber,
    }
  } catch {
    try {
      if (deps.markPreferenceError) {
        await deps.markPreferenceError({ orderNumber, leaseId })
      } else {
        await deps.updateOrder(orderNumber, {
          payment_status: "checkout_error",
          payment_status_detail: "preference_creation_failed",
        })
      }
    } catch {
      // Keep the original provider/storage failure as the checkout error.
    }
    throw new CheckoutFlowProviderError()
  }
}
