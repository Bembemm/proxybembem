import { NextRequest, NextResponse } from "next/server"
import { authorizeAdminAccess } from "@/lib/server/admin-auth"
import { getAdminOrderById } from "@/lib/server/admin-orders"
import {
  getServerEnv,
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "@/lib/server/env"
import { reconcileMercadoPagoOrderPayment } from "@/lib/server/payment-reconciliation"
import { consumeRateLimit } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PRIVATE_NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate"

function response(status: number) {
  return new Response(null, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  })
}

function redirectBack(request: NextRequest, orderId: string, payment: string) {
  const url = new URL(`/admin/pedidos/${orderId}`, request.nextUrl.origin)
  url.searchParams.set("payment", payment)
  const result = NextResponse.redirect(url, 303)
  result.headers.set("Cache-Control", PRIVATE_NO_STORE)
  result.headers.set("Pragma", "no-cache")
  result.headers.set("Expires", "0")
  return result
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
  const requestOrigin = request.nextUrl.origin
  try {
    if (
      !isAllowedCheckoutOrigin({
        originHeader: request.headers.get("origin"),
        configuredSiteUrl: resolvePublicSiteUrl(requestOrigin),
        requestOrigin,
        nodeEnv: process.env.NODE_ENV,
      })
    ) {
      return response(403)
    }
  } catch {
    return response(503)
  }

  const adminAccess = await authorizeAdminAccess({ touch: true })
  if (!adminAccess.ok) {
    if (adminAccess.reason === "unavailable") return response(503)
    if (adminAccess.reason === "not_admin") return response(403)
    return response(401)
  }

  let id: string
  try {
    id = (await params).id
  } catch {
    return response(404)
  }
  if (!UUID_RE.test(id)) return response(404)

  try {
    if (!(await consumeRateLimit({ request, scope: "payment-reconcile" }))) {
      return redirectBack(request, id, "rate-limited")
    }
  } catch {
    return redirectBack(request, id, "error")
  }

  let order: Awaited<ReturnType<typeof getAdminOrderById>>
  try {
    order = await getAdminOrderById(id)
  } catch {
    return redirectBack(request, id, "error")
  }
  if (!order) return response(404)

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
    console.error("Admin payment reconciliation failed", {
      orderId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    })
    return redirectBack(request, id, "error")
  }
}
