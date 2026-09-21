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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRIVATE_NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate"
const RECONCILABLE_STATUSES = new Set(["pending", "in_process", "authorized"])

type CustomerPaymentState =
  | "approved"
  | "pending"
  | "manual_review"
  | "final"
  | "error"

function json(
  status: number,
  payload: { ok: boolean; state: CustomerPaymentState },
) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": PRIVATE_NO_STORE,
      Pragma: "no-cache",
      Expires: "0",
    },
  })
}

function paymentState(
  paymentStatus: string | null,
  outcome?: "updated" | "ignored" | "manual_review" | "not_found",
): CustomerPaymentState {
  if (outcome === "manual_review" || paymentStatus === "manual_review") {
    return "manual_review"
  }
  if (paymentStatus === "approved") return "approved"
  if (
    paymentStatus &&
    ["refunded", "charged_back", "rejected", "cancelled", "canceled"].includes(
      paymentStatus,
    )
  ) {
    return "final"
  }
  return "pending"
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginAccountRequest(request)) {
    return json(403, { ok: false, state: "error" })
  }

  const identity = await getOptionalCustomerIdentity()
  if (!identity) {
    return json(401, { ok: false, state: "error" })
  }

  let id: string
  try {
    id = (await params).id
  } catch {
    return json(404, { ok: false, state: "error" })
  }
  if (!UUID_RE.test(id)) {
    return json(404, { ok: false, state: "error" })
  }

  try {
    if (
      !(await consumeRateLimit({
        request,
        scope: "customer-payment-reconcile",
      }))
    ) {
      return json(429, { ok: false, state: "pending" })
    }
  } catch {
    return json(503, { ok: false, state: "error" })
  }

  let order: Awaited<ReturnType<typeof getOrderByIdForCustomer>>
  try {
    order = await getOrderByIdForCustomer(id, identity.userId)
  } catch {
    return json(503, { ok: false, state: "error" })
  }
  if (!order) {
    return json(404, { ok: false, state: "error" })
  }

  if (!RECONCILABLE_STATUSES.has(order.payment_status)) {
    return json(200, {
      ok: true,
      state: paymentState(order.payment_status),
    })
  }

  try {
    const env = getServerEnv()
    const result = await reconcileMercadoPagoOrderPayment({
      orderNumber: order.order_number,
      currentPaymentId: order.payment_id,
      currentPaymentStatus: order.payment_status,
      accessToken: env.mercadoPagoAccessToken,
    })

    return json(200, {
      ok: true,
      state: paymentState(result.paymentStatus, result.outcome),
    })
  } catch (error) {
    console.error("Customer payment reconciliation failed", {
      orderId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    })
    return json(503, { ok: false, state: "error" })
  }
}
