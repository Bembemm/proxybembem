import assert from "node:assert/strict"
import test from "node:test"
import type { CheckoutData } from "../lib/checkout.ts"
import { OrderConflictError } from "../lib/server/orders.ts"
import { createCartFingerprint, createShippingQuoteToken } from "../lib/server/shipping-quote-token.ts"
import {
  executeCheckoutFlow,
  CheckoutFlowValidationError,
  type CheckoutFlowDependencies,
} from "../lib/server/checkout-flow.ts"

const SECRET = "12345678901234567890123456789012"
const ITEMS = [{ productId: 1, quantity: 1 }]
const CART_FINGERPRINT = createCartFingerprint(ITEMS)

const CUSTOMER: CheckoutData = {
  nome: "Breno Bembem",
  email: "breno@example.com",
  whatsapp: "44991250332",
  cep: "01001000",
  rua: "Praça da Sé",
  numero: "100",
  complemento: "",
  bairro: "Sé",
  cidade: "São Paulo",
  uf: "SP",
}

function makeQuoteToken(priceCents = 1842, serviceId = "1") {
  return createShippingQuoteToken(
    {
      serviceId,
      priceCents,
      destinationCep: CUSTOMER.cep,
      cartFingerprint: CART_FINGERPRINT,
    },
    SECRET,
    1_000,
  )
}

function makeDependencies(overrides: Partial<CheckoutFlowDependencies> = {}): CheckoutFlowDependencies {
  return {
    quoteSecret: SECRET,
    nowMs: () => 2_000,
    buildQuote: async () => ({
      cartFingerprint: CART_FINGERPRINT,
      options: [
        {
          serviceId: "1",
          serviceName: "PAC",
          carrierName: "Correios",
          priceCents: 1842,
          deliveryDays: 6,
          packages: [{ price: "18.42" }],
          quoteToken: "fresh-token",
        },
      ],
    }),
    findOrderByAttempt: async () => null,
    reserveOrder: async (input) => ({
      orderNumber: input.orderNumber,
      publicToken: input.publicToken,
      checkoutFingerprint: input.checkoutFingerprint ?? null,
      checkoutUrl: null,
    }),
    updateOrder: async () => undefined,
    createPreference: async () => ({
      id: "pref-1",
      initPoint: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1",
      sandboxInitPoint: null,
    }),
    selectCheckoutUrl: (preference) => preference.initPoint,
    generateOrderNumber: () => "PB-TESTE123456",
    generatePublicToken: () => "a".repeat(64),
    ...overrides,
  }
}

function checkoutInput(attemptId: string) {
  return {
    items: ITEMS,
    customer: CUSTOMER,
    selectedQuoteToken: makeQuoteToken(),
    checkoutAttemptId: attemptId,
    siteUrl: "https://preview.example.com",
    mercadoPagoAccessToken: "test-token",
    mercadoPagoEnvironment: "sandbox" as const,
  }
}

test("rejects an invalid or cart-mismatched signed freight token before requoting", async () => {
  let quoteCalls = 0
  const deps = makeDependencies({
    buildQuote: async () => {
      quoteCalls += 1
      throw new Error("must not run")
    },
  })

  await assert.rejects(
    () =>
      executeCheckoutFlow(
        {
          items: ITEMS,
          customer: CUSTOMER,
          selectedQuoteToken: "invalid",
          checkoutAttemptId: "550e8400-e29b-41d4-a716-446655440000",
          siteUrl: "https://preview.example.com",
          mercadoPagoAccessToken: "test-token",
          mercadoPagoEnvironment: "sandbox",
        },
        deps,
      ),
    CheckoutFlowValidationError,
  )
  assert.equal(quoteCalls, 0)
})

test("returns refreshed options and creates no order when freight price changed", async () => {
  let reserveCalls = 0
  let paymentCalls = 0
  const deps = makeDependencies({
    buildQuote: async () => ({
      cartFingerprint: CART_FINGERPRINT,
      options: [
        {
          serviceId: "1",
          serviceName: "PAC",
          carrierName: "Correios",
          priceCents: 1990,
          deliveryDays: 5,
          packages: [],
          quoteToken: "new-signed-token",
        },
      ],
    }),
    reserveOrder: async () => {
      reserveCalls += 1
      throw new Error("must not reserve")
    },
    createPreference: async () => {
      paymentCalls += 1
      throw new Error("must not charge")
    },
  })

  const result = await executeCheckoutFlow(
    {
      items: ITEMS,
      customer: CUSTOMER,
      selectedQuoteToken: makeQuoteToken(),
      checkoutAttemptId: "550e8400-e29b-41d4-a716-446655440000",
      siteUrl: "https://preview.example.com",
      mercadoPagoAccessToken: "test-token",
      mercadoPagoEnvironment: "sandbox",
    },
    deps,
  )

  assert.equal(result.kind, "shipping_changed")
  if (result.kind === "shipping_changed") {
    assert.equal(result.options[0]?.priceCents, 1990)
    assert.equal("packages" in result.options[0]!, false)
  }
  assert.equal(reserveCalls, 0)
  assert.equal(paymentCalls, 0)
})

test("reserves trusted subtotal plus freight and creates one payment preference", async () => {
  const reservedInputs: Array<Parameters<CheckoutFlowDependencies["reserveOrder"]>[0]> = []
  const preferenceInputs: Array<Parameters<CheckoutFlowDependencies["createPreference"]>[0]> = []
  const updates: Array<{
    orderNumber: string
    patch: Parameters<CheckoutFlowDependencies["updateOrder"]>[1]
  }> = []

  const result = await executeCheckoutFlow(
    {
      items: ITEMS,
      customer: CUSTOMER,
      selectedQuoteToken: makeQuoteToken(),
      checkoutAttemptId: "550e8400-e29b-41d4-a716-446655440000",
      siteUrl: "https://preview.example.com",
      mercadoPagoAccessToken: "test-token",
      mercadoPagoEnvironment: "sandbox",
    },
    makeDependencies({
      reserveOrder: async (input) => {
        reservedInputs.push(input)
        return {
          orderNumber: input.orderNumber,
          publicToken: input.publicToken,
          checkoutFingerprint: input.checkoutFingerprint ?? null,
          checkoutUrl: null,
        }
      },
      createPreference: async (input) => {
        preferenceInputs.push(input)
        return {
          id: "pref-1",
          initPoint: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1",
          sandboxInitPoint: null,
        }
      },
      updateOrder: async (orderNumber, patch) => {
        updates.push({ orderNumber, patch })
      },
    }),
  )

  const reserved = reservedInputs[0]
  const preferenceInput = preferenceInputs[0]
  assert.ok(reserved)
  assert.ok(preferenceInput)
  assert.equal(result.kind, "created")
  assert.equal(reserved.subtotalCents, 11990)
  assert.equal(reserved.shipping?.amountCents, 1842)
  assert.equal(reserved.totalCents, 13832)
  assert.equal(reserved.shipping?.snapshot && typeof reserved.shipping.snapshot, "object")
  assert.equal(preferenceInput.shipping.amountCents, 1842)
  assert.equal(updates.length, 1)
  assert.equal(updates[0]?.patch.checkout_url, result.kind === "created" ? result.checkoutUrl : null)
})

test("guest checkout reserves normalized email with null customer ownership", async () => {
  let reservedInput: Record<string, unknown> | null = null

  const result = await executeCheckoutFlow(
    {
      ...checkoutInput("550e8400-e29b-41d4-a716-446655440010"),
      customer: { ...CUSTOMER, email: "  BRENO@EXAMPLE.COM  " },
    },
    makeDependencies({
      reserveOrder: async (input) => {
        reservedInput = input as unknown as Record<string, unknown>
        return {
          orderNumber: input.orderNumber,
          publicToken: input.publicToken,
          checkoutFingerprint: input.checkoutFingerprint ?? null,
          checkoutUrl: null,
        }
      },
    }),
  )

  assert.equal(result.kind, "created")
  assert.ok(reservedInput)
  assert.equal(reservedInput.customerEmail, "breno@example.com")
  assert.equal(reservedInput.customerId, null)
})

test("authenticated checkout reserves only trusted account id and canonical account email", async () => {
  let reservedInput: Record<string, unknown> | null = null
  const customerIdentity = {
    userId: "550e8400-e29b-41d4-a716-446655440123",
    email: "breno@example.com",
    emailVerified: true as const,
  }

  const result = await executeCheckoutFlow(
    {
      ...checkoutInput("550e8400-e29b-41d4-a716-446655440011"),
      customer: { ...CUSTOMER, email: " BRENO@EXAMPLE.COM " },
      customerIdentity,
    } as Parameters<typeof executeCheckoutFlow>[0] & { customerIdentity: typeof customerIdentity },
    makeDependencies({
      reserveOrder: async (input) => {
        reservedInput = input as unknown as Record<string, unknown>
        return {
          orderNumber: input.orderNumber,
          publicToken: input.publicToken,
          checkoutFingerprint: input.checkoutFingerprint ?? null,
          checkoutUrl: null,
        }
      },
    }),
  )

  assert.equal(result.kind, "created")
  assert.ok(reservedInput)
  assert.equal(reservedInput.customerEmail, "breno@example.com")
  assert.equal(reservedInput.customerId, customerIdentity.userId)
})

test("authenticated email mismatch fails before order reservation", async () => {
  let reserveCalls = 0
  const customerIdentity = {
    userId: "550e8400-e29b-41d4-a716-446655440123",
    email: "breno@example.com",
    emailVerified: true as const,
  }

  await assert.rejects(
    () =>
      executeCheckoutFlow(
        {
          ...checkoutInput("550e8400-e29b-41d4-a716-446655440012"),
          customer: { ...CUSTOMER, email: "outra@example.com" },
          customerIdentity,
        } as Parameters<typeof executeCheckoutFlow>[0] & { customerIdentity: typeof customerIdentity },
        makeDependencies({
          reserveOrder: async (input) => {
            reserveCalls += 1
            return {
              orderNumber: input.orderNumber,
              publicToken: input.publicToken,
              checkoutFingerprint: input.checkoutFingerprint ?? null,
              checkoutUrl: null,
            }
          },
        }),
      ),
    (error: unknown) =>
      error instanceof CheckoutFlowValidationError &&
      error.message === "Authenticated email mismatch",
  )
  assert.equal(reserveCalls, 0)
})

test("reuses an existing URL for the same attempt and rejects a changed fingerprint", async () => {
  let paymentCalls = 0
  const existingUrl = "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=existing"

  const reused = await executeCheckoutFlow(
    {
      items: ITEMS,
      customer: CUSTOMER,
      selectedQuoteToken: makeQuoteToken(),
      checkoutAttemptId: "550e8400-e29b-41d4-a716-446655440000",
      siteUrl: "https://preview.example.com",
      mercadoPagoAccessToken: "test-token",
      mercadoPagoEnvironment: "sandbox",
    },
    makeDependencies({
      findOrderByAttempt: async () => ({
        orderNumber: "PB-EXISTING",
        publicToken: "b".repeat(64),
        checkoutFingerprint: null,
        checkoutUrl: existingUrl,
      }),
      createPreference: async () => {
        paymentCalls += 1
        throw new Error("must not create")
      },
    }),
  )

  assert.equal(reused.kind, "attempt_conflict")
  assert.equal(paymentCalls, 0)

  let capturedFingerprint = ""
  const created = await executeCheckoutFlow(
    {
      items: ITEMS,
      customer: CUSTOMER,
      selectedQuoteToken: makeQuoteToken(),
      checkoutAttemptId: "550e8400-e29b-41d4-a716-446655440001",
      siteUrl: "https://preview.example.com",
      mercadoPagoAccessToken: "test-token",
      mercadoPagoEnvironment: "sandbox",
    },
    makeDependencies({
      reserveOrder: async (input) => {
        capturedFingerprint = input.checkoutFingerprint ?? ""
        return {
          orderNumber: input.orderNumber,
          publicToken: input.publicToken,
          checkoutFingerprint: input.checkoutFingerprint ?? null,
          checkoutUrl: null,
        }
      },
    }),
  )
  assert.equal(created.kind, "created")

  const same = await executeCheckoutFlow(
    {
      items: ITEMS,
      customer: CUSTOMER,
      selectedQuoteToken: makeQuoteToken(),
      checkoutAttemptId: "550e8400-e29b-41d4-a716-446655440001",
      siteUrl: "https://preview.example.com",
      mercadoPagoAccessToken: "test-token",
      mercadoPagoEnvironment: "sandbox",
    },
    makeDependencies({
      findOrderByAttempt: async () => ({
        orderNumber: "PB-EXISTING2",
        publicToken: "c".repeat(64),
        checkoutFingerprint: capturedFingerprint,
        checkoutUrl: existingUrl,
      }),
      createPreference: async () => {
        paymentCalls += 1
        throw new Error("must not create")
      },
    }),
  )

  assert.equal(same.kind, "reused")
  if (same.kind === "reused") assert.equal(same.checkoutUrl, existingUrl)
  assert.equal(paymentCalls, 0)
})

test("concurrent requests for one checkout attempt create only one payment preference", async () => {
  type SharedOrder = {
    orderNumber: string
    publicToken: string
    checkoutFingerprint: string | null
    checkoutUrl: string | null
  }

  let sharedOrder: SharedOrder | null = null
  let preferenceCalls = 0
  let leaseHeld = false

  const deps = makeDependencies({
    findOrderByAttempt: async () => sharedOrder,
    reserveOrder: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (sharedOrder) {
        throw new OrderConflictError("checkout_attempt_conflict")
      }
      sharedOrder = {
        orderNumber: input.orderNumber,
        publicToken: input.publicToken,
        checkoutFingerprint: input.checkoutFingerprint ?? null,
        checkoutUrl: null,
      }
      return sharedOrder
    },
    claimPreference: async () => {
      if (sharedOrder?.checkoutUrl) {
        return { outcome: "ready", checkoutUrl: sharedOrder.checkoutUrl }
      }
      if (leaseHeld) return { outcome: "busy" }
      leaseHeld = true
      return { outcome: "claimed" }
    },
    completePreference: async ({ checkoutUrl }) => {
      if (!leaseHeld || !sharedOrder) return false
      sharedOrder.checkoutUrl = checkoutUrl
      leaseHeld = false
      return true
    },
    markPreferenceError: async () => true,
    generateLeaseId: () => "550e8400-e29b-41d4-a716-446655440123",
    sleep: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
    },
    createPreference: async () => {
      preferenceCalls += 1
      const id = `pref-${preferenceCalls}`
      await new Promise((resolve) => setTimeout(resolve, 20))
      return {
        id,
        initPoint: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${id}`,
        sandboxInitPoint: null,
      }
    },
  })

  const attemptId = "550e8400-e29b-41d4-a716-446655440099"
  const [first, second] = await Promise.all([
    executeCheckoutFlow(checkoutInput(attemptId), deps),
    executeCheckoutFlow(checkoutInput(attemptId), deps),
  ])

  assert.equal(preferenceCalls, 1)
  assert.notEqual(first.kind, "shipping_changed")
  assert.notEqual(second.kind, "shipping_changed")
  assert.notEqual(first.kind, "attempt_conflict")
  assert.notEqual(second.kind, "attempt_conflict")
  if (
    (first.kind === "created" || first.kind === "reused") &&
    (second.kind === "created" || second.kind === "reused")
  ) {
    assert.equal(first.orderNumber, second.orderNumber)
    assert.equal(first.checkoutUrl, second.checkoutUrl)
  }
})
