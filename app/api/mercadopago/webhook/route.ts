import { NextRequest, NextResponse } from "next/server.js"
import { getMercadoPagoEnv } from "@/lib/server/env"
import {
  getMercadoPagoPayment,
  parseMercadoPagoPaymentId,
  validateMercadoPagoWebhookSignature,
} from "@/lib/server/mercadopago"
import { applyMercadoPagoPaymentEvent } from "@/lib/server/orders"
import { readJsonBody } from "@/lib/server/request-body"

export const runtime = "nodejs"

function paymentAmountToCents(value: number) {
  const scaled = value * 100
  const rounded = Math.round(scaled)
  if (
    !Number.isFinite(scaled) ||
    !Number.isSafeInteger(rounded) ||
    rounded < 0 ||
    Math.abs(scaled - rounded) > 1e-6
  ) {
    throw new Error("Invalid Mercado Pago transaction amount")
  }
  return rounded
}

function topicFromBody(body: unknown) {
  if (!body || typeof body !== "object") return null
  const candidate = body as { type?: unknown }
  return typeof candidate.type === "string" ? candidate.type : null
}

export async function POST(request: NextRequest) {
  const rawDataId = request.nextUrl.searchParams.get("data.id")
  const xSignature = request.headers.get("x-signature")
  const xRequestId = request.headers.get("x-request-id")

  try {
    const env = getMercadoPagoEnv()
    const validSignature = validateMercadoPagoWebhookSignature({
      xSignature,
      xRequestId,
      dataId: rawDataId,
      secret: env.mercadoPagoWebhookSecret,
    })

    if (!validSignature) {
      return new NextResponse(null, { status: 401 })
    }

    let topic = request.nextUrl.searchParams.get("type")
    if (!topic) {
      try {
        topic = topicFromBody(await readJsonBody(request, 8_192))
      } catch {
        topic = null
      }
    }

    if (topic !== "payment") {
      return new NextResponse(null, { status: 200 })
    }

    const paymentId = parseMercadoPagoPaymentId(rawDataId)
    if (!paymentId) {
      console.warn("Mercado Pago webhook carried an invalid payment id")
      return new NextResponse(null, { status: 200 })
    }

    const payment = await getMercadoPagoPayment(paymentId, env.mercadoPagoAccessToken)
    const orderNumber = payment.externalReference

    if (!orderNumber || !/^PB-[A-F0-9]{12}$/.test(orderNumber)) {
      console.warn("Mercado Pago payment has no valid ProxyBembem order reference", {
        paymentId: payment.id,
      })
      return new NextResponse(null, { status: 200 })
    }

    const paidCents = paymentAmountToCents(payment.transactionAmount)
    const result = await applyMercadoPagoPaymentEvent({
      orderNumber,
      paymentId: payment.id,
      incomingStatus: payment.status,
      statusDetail: payment.statusDetail,
      paidCents,
      currencyId: payment.currencyId,
    })

    if (result.outcome === "manual_review") {
      console.warn("Mercado Pago payment requires manual review", {
        orderNumber,
        paymentId: payment.id,
        expectedCents: result.expected_cents,
        receivedCents: result.received_cents,
        currencyId: payment.currencyId,
      })
    } else if (result.outcome === "not_found") {
      console.warn("Mercado Pago webhook referenced an unknown order", {
        orderNumber,
        paymentId: payment.id,
      })
    }

    return new NextResponse(null, { status: 200 })
  } catch (error) {
    console.error("Mercado Pago webhook processing failed", {
      dataId: parseMercadoPagoPaymentId(rawDataId),
      errorName: error instanceof Error ? error.name : "unknown",
    })
    return new NextResponse(null, { status: 500 })
  }
}
