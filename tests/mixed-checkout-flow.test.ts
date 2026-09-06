import assert from "node:assert/strict"
import test from "node:test"
import type { CheckoutData } from "../lib/checkout.ts"
import {
  executeCheckoutFlow,
  type CheckoutFlowDependencies,
} from "../lib/server/checkout-flow.ts"
import {
  createCartFingerprint,
  createShippingQuoteToken,
} from "../lib/server/shipping-quote-token.ts"

const SECRET = "12345678901234567890123456789012"
const ITEMS = [
  { productId: 1, quantity: 1 },
  { productId: 2, quantity: 2 },
]
const CART_FINGERPRINT = createCartFingerprint(ITEMS)
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440777"
const CUSTOMER: CheckoutData = {
  nome: "Cliente Teste",
  email: "cliente@example.com",
  whatsapp: "11999999999",
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
  email: "cliente@example.com",
  emailVerified: true as const,
}

test("reserves and forwards two trusted catalog products in one owned checkout", async () => {
  const reservedInputs: Array<Parameters<CheckoutFlowDependencies["reserveOrder"]>[0]> = []
  const preferenceInputs: Array<Parameters<CheckoutFlowDependencies["createPreference"]>[0]> = []
  const quoteToken = createShippingQuoteToken(
    {
      serviceId: "1",
      priceCents: 1842,
      destinationCep: CUSTOMER.cep,
      cartFingerprint: CART_FINGERPRINT,
    },
    SECRET,
    1_000,
  )

  const dependencies: CheckoutFlowDependencies = {
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
          packages: [{ id: "mixed-volume" }],
          quoteToken: "fresh-token",
        },
      ],
    }),
    findOrderByAttempt: async () => null,
    reserveOrder: async (input) => {
      reservedInputs.push(input)
      return {
        id: ORDER_ID,
        orderNumber: input.orderNumber,
        customerId: CUSTOMER_IDENTITY.userId,
        publicToken: input.publicToken,
        checkoutFingerprint: input.checkoutFingerprint ?? null,
        checkoutUrl: null,
      } as unknown as Awaited<ReturnType<CheckoutFlowDependencies["reserveOrder"]>>
    },
    updateOrder: async () => undefined,
    createPreference: async (input) => {
      preferenceInputs.push(input)
      return {
        id: "pref-mixed",
        initPoint: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-mixed",
        sandboxInitPoint: null,
      }
    },
    selectCheckoutUrl: (preference) => preference.initPoint,
    generateOrderNumber: () => "PB-MIXED123456",
    generatePublicToken: () => "a".repeat(64),
  }

  const result = await executeCheckoutFlow(
    {
      items: ITEMS,
      customer: CUSTOMER,
      customerIdentity: CUSTOMER_IDENTITY,
      selectedQuoteToken: quoteToken,
      checkoutAttemptId: "550e8400-e29b-41d4-a716-446655440099",
      siteUrl: "https://preview.example.com",
      mercadoPagoAccessToken: "test-token",
      mercadoPagoEnvironment: "sandbox",
    },
    dependencies,
  )

  assert.equal(result.kind, "created")
  assert.equal(reservedInputs.length, 1)
  assert.equal(preferenceInputs.length, 1)

  const reserved = reservedInputs[0]!
  assert.equal(reserved.customerId, CUSTOMER_IDENTITY.userId)
  assert.equal(reserved.customerEmail, CUSTOMER_IDENTITY.email)
  assert.equal(reserved.subtotalCents, 25988)
  assert.equal(reserved.shipping?.amountCents, 1842)
  assert.equal(reserved.totalCents, 27830)
  assert.deepEqual(
    reserved.items.map((item) => ({
      productId: item.productId,
      title: item.title,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
    })),
    [
      {
        productId: 1,
        title: "Deck Commander Proxy 100 Cartas",
        unitPriceCents: 11990,
        quantity: 1,
      },
      {
        productId: 2,
        title: "Deck Proxy 60 Cartas",
        unitPriceCents: 6999,
        quantity: 2,
      },
    ],
  )
  assert.deepEqual(
    preferenceInputs[0]!.items.map((item) => ({
      productId: item.productId,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
    })),
    [
      { productId: 1, unitPriceCents: 11990, quantity: 1 },
      { productId: 2, unitPriceCents: 6999, quantity: 2 },
    ],
  )
  assert.equal(
    preferenceInputs[0]!.returnUrl,
    `https://preview.example.com/minha-conta/pedidos/${ORDER_ID}`,
  )
})
