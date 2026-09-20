import { NextRequest, NextResponse } from "next/server"
import { canResumeCheckout } from "@/lib/checkout-expiration"
import { isAllowedMercadoPagoCheckoutUrl } from "@/lib/server/checkout-url"
import { getOptionalCustomerIdentity } from "@/lib/server/customer-auth"
import { getOrderByIdForCustomer } from "@/lib/server/orders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PRIVATE_CACHE_CONTROL =
  "private, no-cache, no-store, max-age=0, must-revalidate"

function privateRedirect(url: URL | string) {
  const response = NextResponse.redirect(url, 303)
  response.headers.set("Cache-Control", PRIVATE_CACHE_CONTROL)
  response.headers.set("Pragma", "no-cache")
  response.headers.set("Expires", "0")
  return response
}

function orderDetailUrl(request: NextRequest, orderId: string) {
  return new URL(`/minha-conta/pedidos/${orderId}`, request.nextUrl.origin)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const identity = await getOptionalCustomerIdentity()

  if (!identity) {
    const loginUrl = new URL("/entrar", request.nextUrl.origin)
    loginUrl.searchParams.set("next", `/minha-conta/pedidos/${id}`)
    return privateRedirect(loginUrl)
  }

  let order: Awaited<ReturnType<typeof getOrderByIdForCustomer>>
  try {
    order = await getOrderByIdForCustomer(id, identity.userId)
  } catch {
    console.error("Customer checkout resume lookup failed", { orderId: id })
    return privateRedirect(orderDetailUrl(request, id))
  }

  if (
    !order ||
    !order.checkout_url ||
    !canResumeCheckout({
      createdAt: order.created_at,
      paymentStatus: order.payment_status,
      fulfillmentStatus: order.fulfillment_status,
    }) ||
    !isAllowedMercadoPagoCheckoutUrl(order.checkout_url)
  ) {
    return privateRedirect(orderDetailUrl(request, id))
  }

  return privateRedirect(order.checkout_url)
}
