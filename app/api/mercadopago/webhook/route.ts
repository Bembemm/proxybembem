import { NextRequest, NextResponse } from "next/server"
import { getMercadoPagoEnv } from "@/lib/server/env"
import {
  getMercadoPagoPayment,
  validateMercadoPagoWebhookSignature,
} from "@/lib/server/mercadopago"
import { getOrderByNumber, updateOrderByNumber } from "@/lib/server/orders"
import { derivePaymentUpdate } from "@/lib/server/payment-status"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const dataId = request.nextUrl.searchParams.get("data.id")
  const xSignature = request.headers.get("x-signature")
  const xRequestId = request.headers.get("x-request-id")

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    // Signature and resource lookup use headers/query params.
  }

  const topic =
    request.nextUrl.searchParams.get("type") ||
    (body && typeof body === "object" && "type" in body && typeof body.type === "string"
      ? body.type
      : null)

  try {
    const env = getMercadoPagoEnv()
    const validSignature = validateMercadoPagoWebhookSignature({
      xSignature,
      xRequestId,
      dataId,
      secret: env.mercadoPagoWebhookSecret,
    })

    if (!validSignature) {
      return new NextResponse(null, { status: 401 })
    }

    if (topic !== "payment" || !dataId) {
      return new NextResponse(null, { status: 200 })
    }

    const payment = await getMercadoPagoPayment(dataId, env.mercadoPagoAccessToken)
    const orderNumber = payment.externalReference

    if (!orderNumber || !/^PB-[A-F0-9]{12}$/.test(orderNumber)) {
      console.warn("Mercado Pago payment has no valid ProxyBembem order reference", {
        paymentId: payment.id,
      })
      return new NextResponse(null, { status: 200 })
    }

    const order = await getOrderByNumber(orderNumber)
    if (!order) {
      console.warn("Mercado Pago webhook referenced an unknown order", {
        paymentId: payment.id,
        orderNumber,
      })
      return new NextResponse(null, { status: 200 })
    }

    const paidCents = Math.round(payment.transactionAmount * 100)
    const amountMatches = paidCents === order.subtotal_cents && payment.currencyId === "BRL"
    const update = derivePaymentUpdate({
      currentStatus: order.payment_status,
      currentPaymentId: order.payment_id,
      incomingStatus: payment.status,
      incomingPaymentId: payment.id,
      amountMatches,
      statusDetail: payment.statusDetail,
    })

    if (!update) {
      return new NextResponse(null, { status: 200 })
    }

    if (update.paymentStatus === "manual_review") {
      console.warn("Mercado Pago approved amount did not match the order", {
        orderNumber,
        paymentId: payment.id,
        expectedCents: order.subtotal_cents,
        receivedCents: paidCents,
        currencyId: payment.currencyId,
      })
    }

    await updateOrderByNumber(orderNumber, {
      payment_id: update.paymentId,
      payment_status: update.paymentStatus,
      payment_status_detail: update.paymentStatusDetail,
    })

    return new NextResponse(null, { status: 200 })
  } catch (error) {
    console.error("Mercado Pago webhook processing failed", {
      dataId,
      error: error instanceof Error ? error.message : "unknown",
    })
    return new NextResponse(null, { status: 500 })
  }
}
