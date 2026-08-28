import { createHmac, timingSafeEqual } from "node:crypto"
import type { CheckoutOrderItem } from "./checkout-order.ts"

const MERCADO_PAGO_API = "https://api.mercadopago.com"

interface MercadoPagoPreferenceInput {
  accessToken: string
  orderNumber: string
  items: CheckoutOrderItem[]
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
  currencyId: string | null
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
  const response = await mercadoPagoFetch("/checkout/preferences", input.accessToken, {
    method: "POST",
    body: JSON.stringify({
      items: input.items.map((item) => ({
        id: String(item.productId),
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unitPriceCents / 100,
        currency_id: "BRL",
      })),
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

export async function getMercadoPagoPayment(
  paymentId: string,
  accessToken: string,
): Promise<MercadoPagoPayment> {
  if (!/^\d+$/.test(paymentId)) {
    throw new Error("Invalid payment id")
  }

  const response = await mercadoPagoFetch(`/v1/payments/${encodeURIComponent(paymentId)}`, accessToken)
  const data = (await response.json()) as {
    id?: unknown
    status?: unknown
    status_detail?: unknown
    transaction_amount?: unknown
    external_reference?: unknown
    currency_id?: unknown
  }

  if (
    (typeof data.id !== "number" && typeof data.id !== "string") ||
    typeof data.status !== "string" ||
    typeof data.transaction_amount !== "number"
  ) {
    throw new Error("Payment provider returned an invalid payment")
  }

  return {
    id: String(data.id),
    status: data.status,
    statusDetail: typeof data.status_detail === "string" ? data.status_detail : null,
    transactionAmount: data.transaction_amount,
    externalReference:
      typeof data.external_reference === "string" ? data.external_reference : null,
    currencyId: typeof data.currency_id === "string" ? data.currency_id : null,
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
