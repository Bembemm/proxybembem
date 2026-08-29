import { createHmac, timingSafeEqual } from "node:crypto"
import type { CheckoutOrderItem } from "./checkout-order.ts"

const MERCADO_PAGO_API = "https://api.mercadopago.com"

interface MercadoPagoPreferenceInput {
  accessToken: string
  orderNumber: string
  items: CheckoutOrderItem[]
  shipping?: {
    serviceName: string
    carrierName: string
    amountCents: number
  }
  notificationUrl: string
  returnUrl: string
  payerName: string
}

export interface MercadoPagoPreference {
  id: string
  initPoint: string
  sandboxInitPoint: string | null
}

export interface MercadoPagoPayment {
  id: string
  status: string
  statusDetail: string | null
  transactionAmount: number
  externalReference: string | null
  currencyId: string
}

interface WebhookSignatureInput {
  xSignature: string | null | undefined
  xRequestId: string | null | undefined
  dataId: string | null | undefined
  secret: string
}

async function mercadoPagoFetch(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(`${MERCADO_PAGO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    const providerRequestId = response.headers.get("x-request-id")
    console.error("Mercado Pago API request failed", {
      path,
      status: response.status,
      providerRequestId,
    })
    throw new Error("Payment provider request failed")
  }

  return response
}

export async function createMercadoPagoPreference(
  input: MercadoPagoPreferenceInput,
): Promise<MercadoPagoPreference> {
  let shippingItem: {
    id: string
    title: string
    quantity: number
    unit_price: number
    currency_id: string
  } | null = null

  if (input.shipping) {
    if (
      !Number.isSafeInteger(input.shipping.amountCents) ||
      input.shipping.amountCents <= 0 ||
      !input.shipping.serviceName.trim() ||
      !input.shipping.carrierName.trim()
    ) {
      throw new Error("Invalid freight amount or service")
    }

    shippingItem = {
      id: "shipping",
      title: `Frete - ${input.shipping.carrierName.trim()} / ${input.shipping.serviceName.trim()}`,
      quantity: 1,
      unit_price: input.shipping.amountCents / 100,
      currency_id: "BRL",
    }
  }

  const preferenceItems = [
    ...input.items.map((item) => ({
      id: String(item.productId),
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unitPriceCents / 100,
      currency_id: "BRL",
    })),
    ...(shippingItem ? [shippingItem] : []),
  ]

  const response = await mercadoPagoFetch("/checkout/preferences", input.accessToken, {
    method: "POST",
    body: JSON.stringify({
      items: preferenceItems,
      payer: {
        name: input.payerName,
      },
      external_reference: input.orderNumber,
      notification_url: input.notificationUrl,
      back_urls: {
        success: input.returnUrl,
        pending: input.returnUrl,
        failure: input.returnUrl,
      },
      auto_return: "approved",
    }),
  })

  const data = (await response.json()) as {
    id?: unknown
    init_point?: unknown
    sandbox_init_point?: unknown
  }

  if (typeof data.id !== "string" || typeof data.init_point !== "string") {
    throw new Error("Payment provider returned an invalid preference")
  }

  return {
    id: data.id,
    initPoint: data.init_point,
    sandboxInitPoint:
      typeof data.sandbox_init_point === "string" ? data.sandbox_init_point : null,
  }
}

export function parseMercadoPagoPaymentId(value: string | null): string | null {
  if (!value || !/^\d{1,32}$/.test(value)) return null
  return value
}

export async function getMercadoPagoPayment(
  paymentId: string,
  accessToken: string,
): Promise<MercadoPagoPayment> {
  const normalizedPaymentId = parseMercadoPagoPaymentId(paymentId)
  if (!normalizedPaymentId) {
    throw new Error("Invalid payment id")
  }

  const response = await mercadoPagoFetch(
    `/v1/payments/${encodeURIComponent(normalizedPaymentId)}`,
    accessToken,
  )
  const data = (await response.json()) as {
    id?: unknown
    status?: unknown
    status_detail?: unknown
    transaction_amount?: unknown
    external_reference?: unknown
    currency_id?: unknown
  }

  const providerPaymentId =
    typeof data.id === "number" || typeof data.id === "string"
      ? parseMercadoPagoPaymentId(String(data.id))
      : null

  if (
    !providerPaymentId ||
    providerPaymentId !== normalizedPaymentId ||
    typeof data.status !== "string" ||
    !data.status ||
    data.status.length > 100 ||
    typeof data.transaction_amount !== "number" ||
    !Number.isFinite(data.transaction_amount) ||
    data.transaction_amount < 0 ||
    typeof data.currency_id !== "string" ||
    !/^[A-Z]{3}$/.test(data.currency_id) ||
    (data.status_detail !== undefined &&
      data.status_detail !== null &&
      typeof data.status_detail !== "string") ||
    (data.external_reference !== undefined &&
      data.external_reference !== null &&
      typeof data.external_reference !== "string")
  ) {
    throw new Error("Payment provider returned an invalid payment")
  }

  return {
    id: providerPaymentId,
    status: data.status,
    statusDetail: typeof data.status_detail === "string" ? data.status_detail : null,
    transactionAmount: data.transaction_amount,
    externalReference:
      typeof data.external_reference === "string" ? data.external_reference : null,
    currencyId: data.currency_id,
  }
}

export function validateMercadoPagoWebhookSignature({
  xSignature,
  xRequestId,
  dataId,
  secret,
}: WebhookSignatureInput) {
  if (!xSignature || !xRequestId || !dataId || !secret) return false

  const signatureParts = new Map(
    xSignature.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=")
      return [key, rest.join("=")]
    }),
  )

  const ts = signatureParts.get("ts")
  const v1 = signatureParts.get("v1")

  if (!ts || !/^\d+$/.test(ts) || !v1 || !/^[a-f0-9]{64}$/i.test(v1)) {
    return false
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const expectedHex = createHmac("sha256", secret).update(manifest).digest("hex")
  const expected = Buffer.from(expectedHex, "hex")
  const received = Buffer.from(v1, "hex")

  return expected.length === received.length && timingSafeEqual(expected, received)
}
