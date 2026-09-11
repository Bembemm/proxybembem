import assert from "node:assert/strict"
import test from "node:test"
import type { CheckoutData } from "../lib/checkout.ts"
import type { CatalogProduct } from "../lib/products/product.ts"
import { OrderConflictError } from "../lib/server/orders.ts"
import {
  createCartFingerprint,
  createShippingQuoteToken,
} from "../lib/server/shipping-quote-token.ts"
import {
  executeCheckoutFlow,
  CheckoutFlowValidationError,
  type CheckoutFlowDependencies,
} from "../lib/server/checkout-flow.ts"

const SECRET = "12345678901234567890123456789012"
const ITEMS = [{ productId: 1, quantity: 1 }]
const CART_FINGERPRINT = createCartFingerprint(ITEMS)
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440777"

const TEST_PRODUCT: CatalogProduct = {
  id: 1,
  status: "published",
  title: "Deck Commander Proxy 100 Cartas",
  image: "/products/deck-commander.png",
  imagePath: "/products/deck-commander.png",
  originalPrice: 149.9,
  discountPrice: 119.9,
  tag: null,
  category: "Decks",
  colors: [],
  featured: true,
  highlights: [],
  description: "Produto de teste",
  details: [],
  sections: [],
  shipping: { weightKg: 0.5, lengthCm: 25, widthCm: 19, heightCm: 4 },
  displayOrder: 1,
  createdAt: "2026-09-07T12:00:00.000Z",
  updatedAt: "2026-09-07T12:00:00.000Z",
}

const CUSTOMER: CheckoutData = {
  nome: "Breno Bembem",
  email: "breno@example.com",
  whatsapp: "44991250332",
  cpf: "52998224725",
  cep: "01001000",
  rua: "Praça da Sé",
  numero: "100",
  complemento: "",
  bairro: "Sé",
  cidade: "São Paulo",
  uf: "SP",
}

const CUSTOMER_IDENTITY = {
  userId: "550e8400-e29b-41d4-a716-446655440123",
  email: "breno@example.com",
  emailVerified: true as const,
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

function attemptView(input: {
  id?: string
  orderNumber?: string
  customerId?: string | null
  publicToken?: string
  checkoutFingerprint?: string | null
  checkoutUrl?: string | null
}) {
  return {
    id: input.id ?? ORDER_ID,
    orderNumber: input.orderNumber ?? "PB-TESTE123456",
    customerId: input.customerId === undefined ? CUSTOMER_IDENTITY.userId : input.customerId,
    publicToken: input.publicToken ?? "a".repeat(64),
    checkoutFingerprint: input.checkoutFingerprint ?? null,
    checkoutUrl: input.checkoutUrl ?? null,
  } as unknown as Awaited<ReturnType<CheckoutFlowDependencies["reserveOrder"]>>
}

function makeDependencies(
  overrides: Partial<CheckoutFlowDependencies> = {},
): CheckoutFlowDependencies {
  return {
    quoteSecret: SECRET,
    nowMs: () => 2_000,
    resolveProducts: async (ids) =>
      ids.includes(TEST_PRODUCT.id) ? [TEST_PRODUCT] : [],
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
    reserveOrder: async (input) =>
      attemptView({
        orderNumber: input.orderNumber,
        checkoutFingerprint: input.checkoutFingerprint ?? null,
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
    customerIdentity: CUSTOMER_IDENTITY,
    selectedQuoteToken: makeQuoteToken(),
    checkoutAttemptId: attemptId,
    siteUrl: "https://preview.example.com",
    mercadoPagoAccessToken: "test-token",
    mercadoPagoEnvironment: "sandbox" as const,
  }
}

test("requires a verified authenticated customer before any order reservation", async () => {
  let reserveCalls = 0

  await assert.rejects(
    () =>
      executeCheckoutFlow(
        {
          ...checkoutInput("550e8400-e29b-41d4-a716-446655440009"),
          customerIdentity: undefined as unknown as typeof CUSTOMER_IDENTITY,
        },
        makeDependencies({
          reserveOrder: async () => {
            reserveCalls += 1
            return attemptView({})
          },
        }),
      ),
    (error: unknown) =>
      error instanceof CheckoutFlowValidationError &&
      error.message === "Authenticated customer required",
  )

  assert.equal(reserveCalls, 0)
})

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
          ...checkoutInput("550e8400-e29b-41d4-a716-446655440000"),
          selectedQuoteToken: "invalid",
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
    checkoutInput("550e8400-e29b-41d4-a716-446655440010"),
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

test("new checkout reserves trusted ownership and returns Mercado Pago to private order UUID", async () => {
  const reservedInputs: Array<Parameters<CheckoutFlowDependencies["reserveOrder"]>[0]> = []
  const preferenceInputs: Array<Parameters<CheckoutFlowDependencies["createPreference"]>[0]> = []
  const updates: Array<{
    orderNumber: string
    patch: Parameters<CheckoutFlowDependencies["updateOrder"]>[1]
  }> = []

  const result = await executeCheckoutFlow(
    {
      ...checkoutInput("550e8400-e29b-41d4-a716-446655440011"),
      customer: { ...CUSTOMER, email: " BRENO@EXAMPLE.COM " },
    },
    makeDependencies({
      reserveOrder: async (input) => {
        reservedInputs.push(input)
        return attemptView({
          id: ORDER_ID,
          orderNumber: input.orderNumber,
          customerId: input.customerId ?? null,
          checkoutFingerprint: input.checkoutFingerprint ?? null,
        })
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
  assert.equal(reserved.customerEmail, CUSTOMER_IDENTITY.email)
  assert.equal(reserved.customerCpf, "52998224725")
  assert.equal(reserved.customerId, CUSTOMER_IDENTITY.userId)
  assert.equal(reserved.subtotalCents, 11990)
  assert.equal(reserved.shipping?.amountCents, 1842)
  assert.equal(reserved.totalCents, 13832)
  assert.equal(preferenceInput.shipping.amountCents, 1842)
  assert.equal(
    preferenceInput.returnUrl,
    `https://preview.example.com/minha-conta/pedidos/${ORDER_ID}`,
  )
  assert.equal(updates.length, 1)
  assert.equal(
    updates[0]?.patch.checkout_url,
    result.kind === "created" ? result.checkoutUrl : null,
  )
})

test("authenticated email mismatch fails before order reservation", async () => {
  let reserveCalls = 0

  await assert.rejects(
    () =>
      executeCheckoutFlow(
        {
          ...checkoutInput("550e8400-e29b-41d4-a716-446655440012"),
          customer: { ...CUSTOMER, email: "outra@example.com" },
        },
        makeDependencies({
          reserveOrder: async () => {
            reserveCalls += 1
            return attemptView({})
          },
        }),
      ),
    (error: unknown) =>
      error instanceof CheckoutFlowValidationError &&
      error.message === "Authenticated email mismatch",
  )
  assert.equal(reserveCalls, 0)
})

test("attempt reuse is allowed only for the same authenticated customer", async () => {
  const existingUrl =
    "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=existing"
  let capturedFingerprint = ""

  const created = await executeCheckoutFlow(
    checkoutInput("550e8400-e29b-41d4-a716-446655440020"),
    makeDependencies({
      reserveOrder: async (input) => {
        capturedFingerprint = input.checkoutFingerprint ?? ""
        return attemptView({
          id: ORDER_ID,
          orderNumber: input.orderNumber,
          customerId: CUSTOMER_IDENTITY.userId,
          checkoutFingerprint: capturedFingerprint,
        })
      },
    }),
  )
  assert.equal(created.kind, "created")
  assert.ok(capturedFingerprint)

  for (const customerId of [
    "550e8400-e29b-41d4-a716-446655440999",
    null,
  ]) {
    let preferenceCalls = 0
    const result = await executeCheckoutFlow(
      checkoutInput("550e8400-e29b-41d4-a716-446655440020"),
      makeDependencies({
        findOrderByAttempt: async () =>
          attemptView({
            id: ORDER_ID,
            orderNumber: "PB-EXISTING1234",
            customerId,
            checkoutFingerprint: capturedFingerprint,
            checkoutUrl: existingUrl,
          }),
        createPreference: async () => {
          preferenceCalls += 1
          throw new Error("must not create")
        },
      }),
    )

    assert.equal(result.kind, "attempt_conflict")
    assert.equal(preferenceCalls, 0)
  }

  const sameOwner = await executeCheckoutFlow(
    checkoutInput("550e8400-e29b-41d4-a716-446655440020"),
    makeDependencies({
      findOrderByAttempt: async () =>
        attemptView({
          id: ORDER_ID,
          orderNumber: "PB-EXISTING1234",
          customerId: CUSTOMER_IDENTITY.userId,
          checkoutFingerprint: capturedFingerprint,
          checkoutUrl: existingUrl,
        }),
    }),
  )

  assert.equal(sameOwner.kind, "reused")
  if (sameOwner.kind === "reused") {
    assert.equal(sameOwner.checkoutUrl, existingUrl)
  }
})

test("changed checkout fingerprint still conflicts for the same owner", async () => {
  const result = await executeCheckoutFlow(
    checkoutInput("550e8400-e29b-41d4-a716-446655440030"),
    makeDependencies({
      findOrderByAttempt: async () =>
        attemptView({
          customerId: CUSTOMER_IDENTITY.userId,
          checkoutFingerprint: "f".repeat(64),
          checkoutUrl:
            "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=existing",
        }),
    }),
  )

  assert.equal(result.kind, "attempt_conflict")
})

test("concurrent requests for one owned checkout attempt create only one payment preference", async () => {
  type SharedOrder = {
    id: string
    orderNumber: string
    customerId: string | null
    publicToken: string
    checkoutFingerprint: string | null
    checkoutUrl: string | null
  }

  let sharedOrder: SharedOrder | null = null
  let preferenceCalls = 0
  let leaseHeld = false

  const deps = makeDependencies({
    findOrderByAttempt: async () =>
      sharedOrder as unknown as Awaited<
        ReturnType<CheckoutFlowDependencies["findOrderByAttempt"]>
      >,
    reserveOrder: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (sharedOrder) {
        throw new OrderConflictError("checkout_attempt_conflict")
      }
      sharedOrder = {
        id: ORDER_ID,
        orderNumber: input.orderNumber,
        customerId: CUSTOMER_IDENTITY.userId,
        publicToken: input.publicToken,
        checkoutFingerprint: input.checkoutFingerprint ?? null,
        checkoutUrl: null,
      }
      return sharedOrder as unknown as Awaited<
        ReturnType<CheckoutFlowDependencies["reserveOrder"]>
      >
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
    generateLeaseId: () => "550e8400-e29b-41d4-a716-446655440124",
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