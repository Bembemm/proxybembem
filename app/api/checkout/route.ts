import { randomBytes } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { digitsOnly, validateCheckout, type CheckoutData } from "@/lib/checkout"
import { buildCheckoutOrder } from "@/lib/server/checkout-order"
import { getServerEnv, resolvePublicSiteUrl } from "@/lib/server/env"
import { createMercadoPagoPreference } from "@/lib/server/mercadopago"
import { createOrder, updateOrderByNumber } from "@/lib/server/orders"

export const runtime = "nodejs"

function parseCustomer(value: unknown): CheckoutData | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as { nome?: unknown; whatsapp?: unknown; cep?: unknown }
  if (
    typeof candidate.nome !== "string" ||
    typeof candidate.whatsapp !== "string" ||
    typeof candidate.cep !== "string"
  ) {
    return null
  }

  return {
    nome: candidate.nome,
    whatsapp: candidate.whatsapp,
    cep: candidate.cep,
  }
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > 32_768) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 413 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 })
  }

  const payload = body as { items?: unknown; customer?: unknown }
  const customer = parseCustomer(payload.customer)
  if (!customer) {
    return NextResponse.json({ error: "Confira seus dados e tente novamente." }, { status: 400 })
  }

  const fieldErrors = validateCheckout(customer)
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json(
      { error: "Confira seus dados e tente novamente.", fieldErrors },
      { status: 400 },
    )
  }

  let checkoutOrder
  try {
    checkoutOrder = buildCheckoutOrder(payload.items)
  } catch {
    return NextResponse.json({ error: "Carrinho inválido. Atualize a página e tente novamente." }, { status: 400 })
  }

  const normalizedCustomer = {
    nome: customer.nome.trim().replace(/\s+/g, " "),
    whatsapp: digitsOnly(customer.whatsapp),
    cep: digitsOnly(customer.cep),
  }

  const orderNumber = `PB-${randomBytes(6).toString("hex").toUpperCase()}`
  const publicToken = randomBytes(32).toString("hex")

  try {
    const env = getServerEnv()
    const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
    const originHeader = request.headers.get("origin")

    if (originHeader && new URL(originHeader).origin !== siteUrl) {
      return NextResponse.json({ error: "Origem de checkout inválida." }, { status: 403 })
    }

    await createOrder({
      orderNumber,
      publicToken,
      customerName: normalizedCustomer.nome,
      whatsapp: normalizedCustomer.whatsapp,
      cep: normalizedCustomer.cep,
      items: checkoutOrder.items,
      subtotalCents: checkoutOrder.subtotalCents,
    })

    const returnUrl = `${siteUrl}/pedido/${publicToken}`
    const preference = await createMercadoPagoPreference({
      accessToken: env.mercadoPagoAccessToken,
      orderNumber,
      items: checkoutOrder.items,
      notificationUrl: `${siteUrl}/api/mercadopago/webhook`,
      returnUrl,
      payerName: normalizedCustomer.nome,
    })

    await updateOrderByNumber(orderNumber, {
      preference_id: preference.id,
      payment_status: "pending",
      payment_status_detail: null,
    })

    const checkoutUrl =
      env.mercadoPagoAccessToken.startsWith("TEST-") && preference.sandboxInitPoint
        ? preference.sandboxInitPoint
        : preference.initPoint

    return NextResponse.json(
      { checkoutUrl, orderNumber },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Checkout creation failed", {
      orderNumber,
      error: error instanceof Error ? error.message : "unknown",
    })

    try {
      await updateOrderByNumber(orderNumber, {
        payment_status: "checkout_error",
        payment_status_detail: "preference_creation_failed",
      })
    } catch {
      // The order may not have been inserted yet, or storage may be temporarily unavailable.
    }

    return NextResponse.json(
      { error: "Não foi possível iniciar o pagamento agora. Você pode tentar novamente ou usar o WhatsApp." },
      { status: 503 },
    )
  }
}
