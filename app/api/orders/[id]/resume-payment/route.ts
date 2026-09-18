import { NextRequest, NextResponse } from "next/server"
import { canResumeCheckout } from "@/lib/checkout-expiration"
import { isAllowedMercadoPagoCheckoutUrl } from "@/lib/server/checkout-url"
import { getOptionalCustomerIdentity } from "@/lib/server/customer-auth"
import { getOrderByIdForCustomer } from "@/lib/server/orders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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
    return NextResponse.redirect(loginUrl, 303)
  }

  let order: Awaited<ReturnType<typeof getOrderByIdForCustomer>>
  try {
    order = await getOrderByIdForCustomer(id, identity.userId)
  } catch {
    console.error("Customer checkout resume lookup failed", { orderId: id })
    return NextResponse.redirect(orderDetailUrl(request, id), 303)
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
    return NextResponse.redirect(orderDetailUrl(request, id), 303)
  }

  return NextResponse.redirect(order.checkout_url, 303)
}
