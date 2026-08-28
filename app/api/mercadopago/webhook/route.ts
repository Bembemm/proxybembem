import { NextRequest, NextResponse } from "next/server"
import { getServerEnv } from "@/lib/server/env"
import {
  getMercadoPagoPayment,
  validateMercadoPagoWebhookSignature,
} from "@/lib/server/mercadopago"
import { getOrderByNumber, updateOrderByNumber } from "@/lib/server/orders"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const dataId = request.nextUrl.searchParams.get("data.id")
  const xSignature = request.headers.get("x-signature")
  const xRequestId = request.headers.get("x-request-id")

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    // Signature and resource lookup use headers/query params; malformed JSON is rejected below.
  }

  const topic =
    request.nextUrl.searchParams.get("type") ||
    (body && typeof body === "object" && "type" in body && typeof body.type === "string"
      ? body.type
      : null)

  try {
    const env = getServerEnv()
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
    const paymentStatus =
      payment.status === "approved" && !amountMatches ? "manual_review" : payment.status
    const statusDetail =
      payment.status === "approved" && !amountMatches
        ? `amount_or_currency_mismatch:${paidCents}:${payment.currencyId ?? "unknown"}`
        : payment.statusDetail

    await updateOrderByNumber(orderNumber, {
      payment_id: payment.id,
      payment_status: paymentStatus,
      payment_status_detail: statusDetail,
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
