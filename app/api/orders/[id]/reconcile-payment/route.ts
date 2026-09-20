import { NextRequest, NextResponse } from "next/server"
import { isSameOriginAccountRequest } from "@/lib/server/customer-account-actions"
import { getOptionalCustomerIdentity } from "@/lib/server/customer-auth"
import { getServerEnv } from "@/lib/server/env"
import { getOrderByIdForCustomer } from "@/lib/server/orders"
import { reconcileMercadoPagoOrderPayment } from "@/lib/server/payment-reconciliation"
import { consumeRateLimit } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PRIVATE_NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate"

function redirectBack(request: NextRequest, orderId: string, payment: string) {
  const url = new URL(`/minha-conta/pedidos/${orderId}`, request.nextUrl.origin)
  url.searchParams.set("payment", payment)
  const response = NextResponse.redirect(url, 303)
  response.headers.set("Cache-Control", PRIVATE_NO_STORE)
  response.headers.set("Pragma", "no-cache")
  response.headers.set("Expires", "0")
  return response
}

function outcomeFeedback(result: Awaited<ReturnType<typeof reconcileMercadoPagoOrderPayment>>) {
  if (result.outcome === "manual_review") return "manual-review"
  if (result.outcome === "not_found") return "not-found"
  if (result.paymentStatus === "approved") return "approved"
  if (result.outcome === "updated") return "updated"
  return "unchanged"
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginAccountRequest(request)) {
    return new Response(null, {
      status: 403,
      headers: { "Cache-Control": PRIVATE_NO_STORE },
    })
  }

  let id: string
  try {
    id = (await params).id
  } catch {
    return new Response(null, { status: 404 })
  }
  if (!UUID_RE.test(id)) return new Response(null, { status: 404 })

  try {
    if (!(await consumeRateLimit({ request, scope: "payment-reconcile" }))) {
      return redirectBack(request, id, "rate-limited")
    }
  } catch {
    return redirectBack(request, id, "error")
  }

  const identity = await getOptionalCustomerIdentity()
  if (!identity) {
    const loginUrl = new URL("/entrar", request.nextUrl.origin)
    loginUrl.searchParams.set("next", `/minha-conta/pedidos/${id}`)
    const response = NextResponse.redirect(loginUrl, 303)
    response.headers.set("Cache-Control", PRIVATE_NO_STORE)
    return response
  }

  let order: Awaited<ReturnType<typeof getOrderByIdForCustomer>>
  try {
    order = await getOrderByIdForCustomer(id, identity.userId)
  } catch {
    return redirectBack(request, id, "error")
  }
  if (!order) return new Response(null, { status: 404 })

  try {
    const env = getServerEnv()
    const result = await reconcileMercadoPagoOrderPayment({
      orderNumber: order.order_number,
      currentPaymentId: order.payment_id,
      currentPaymentStatus: order.payment_status,
      accessToken: env.mercadoPagoAccessToken,
    })
    return redirectBack(request, id, outcomeFeedback(result))
  } catch (error) {
    console.error("Customer payment reconciliation failed", {
      orderId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    })
    return redirectBack(request, id, "error")
  }
}
