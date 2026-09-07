import assert from "node:assert/strict"
import test from "node:test"
import type { CheckoutData } from "../lib/checkout.ts"
import type { CatalogProduct } from "../lib/products/product.ts"
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

function resolvedProduct(input: {
  id: number
  title: string
  discountPrice: number
}): CatalogProduct {
  return {
    id: input.id,
    status: "published",
    title: input.title,
    image: "/products/deck-commander.png",
    imagePath: "/products/deck-commander.png",
    originalPrice: input.discountPrice + 30,
    discountPrice: input.discountPrice,
    tag: null,
    category: "Decks",
    colors: [],
    featured: true,
    highlights: [],
    description: "Produto de teste",
    details: [],
    sections: [],
    shipping: { weightKg: 0.5, lengthCm: 25, widthCm: 19, heightCm: 4 },
    displayOrder: input.id,
    createdAt: "2026-09-07T12:00:00.000Z",
    updatedAt: "2026-09-07T12:00:00.000Z",
  }
}

test("reserves and forwards two products resolved from the current published catalog", async () => {
  const reservedInputs: Array<Parameters<CheckoutFlowDependencies["reserveOrder"]>[0]> = []
  const preferenceInputs: Array<Parameters<CheckoutFlowDependencies["createPreference"]>[0]> = []
  const resolverCalls: number[][] = []
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

  const dependencies = {
    quoteSecret: SECRET,
    nowMs: () => 2_000,
    resolveProducts: async (ids: number[]) => {
      resolverCalls.push(ids)
      return [
        resolvedProduct({ id: 1, title: "Commander atual", discountPrice: 125 }),
        resolvedProduct({ id: 2, title: "Deck 60 atual", discountPrice: 75 }),
      ]
    },
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
    reserveOrder: async (input: Parameters<CheckoutFlowDependencies["reserveOrder"]>[0]) => {
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
    createPreference: async (input: Parameters<CheckoutFlowDependencies["createPreference"]>[0]) => {
      preferenceInputs.push(input)
      return {
        id: "pref-mixed",
        initPoint: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-mixed",
        sandboxInitPoint: null,
      }
    },
    selectCheckoutUrl: (preference: { initPoint: string }) => preference.initPoint,
    generateOrderNumber: () => "PB-MIXED123456",
    generatePublicToken: () => "a".repeat(64),
  } as unknown as CheckoutFlowDependencies

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
  assert.deepEqual(resolverCalls, [[1, 2]])
  assert.equal(reservedInputs.length, 1)
  assert.equal(preferenceInputs.length, 1)

  const reserved = reservedInputs[0]!
  assert.equal(reserved.customerId, CUSTOMER_IDENTITY.userId)
  assert.equal(reserved.customerEmail, CUSTOMER_IDENTITY.email)
  assert.equal(reserved.subtotalCents, 27500)
  assert.equal(reserved.shipping?.amountCents, 1842)
  assert.equal(reserved.totalCents, 29342)
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
        title: "Commander atual",
        unitPriceCents: 12500,
        quantity: 1,
      },
      {
        productId: 2,
        title: "Deck 60 atual",
        unitPriceCents: 7500,
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
      { productId: 1, unitPriceCents: 12500, quantity: 1 },
      { productId: 2, unitPriceCents: 7500, quantity: 2 },
    ],
  )
  assert.equal(
    preferenceInputs[0]!.returnUrl,
    `https://preview.example.com/minha-conta/pedidos/${ORDER_ID}`,
  )
})
