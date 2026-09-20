import {
  getMercadoPagoPayment,
  mercadoPagoAmountToCents,
  searchMercadoPagoPaymentsByExternalReference,
} from "./mercadopago.ts"
import {
  applyMercadoPagoPaymentEvent,
  type PaymentEventResult,
} from "./orders.ts"

export type PaymentReconciliationOutcome =
  | "updated"
  | "ignored"
  | "manual_review"
  | "not_found"

export interface PaymentReconciliationResult {
  outcome: PaymentReconciliationOutcome
  paymentStatus: string | null
  paymentId: string | null
}

function preferredSearchPayment(
  results: Awaited<ReturnType<typeof searchMercadoPagoPaymentsByExternalReference>>,
) {
  const approved = results.find((payment) => payment.status === "approved")
  if (approved) return approved

  return (
    results.find(
      (payment) =>
        payment.status === "refunded" || payment.status === "charged_back",
    ) ?? null
  )
}

function toResult(result: PaymentEventResult): PaymentReconciliationResult {
  return {
    outcome: result.outcome,
    paymentStatus: result.payment_status,
    paymentId: result.payment_id,
  }
}

export async function reconcileMercadoPagoOrderPayment(input: {
  orderNumber: string
  currentPaymentId: string | null
  currentPaymentStatus: string
  accessToken: string
}): Promise<PaymentReconciliationResult> {
  let paymentId: string | null = null

  if (
    input.currentPaymentId &&
    ["approved", "refunded", "charged_back"].includes(input.currentPaymentStatus)
  ) {
    paymentId = input.currentPaymentId
  } else {
    const results = await searchMercadoPagoPaymentsByExternalReference(
      input.orderNumber,
      input.accessToken,
    )
    const preferred = preferredSearchPayment(results)
    if (!preferred) {
      const latest = results[0] ?? null
      return {
        outcome: latest ? "ignored" : "not_found",
        paymentStatus: latest?.status ?? null,
        paymentId: latest?.id ?? null,
      }
    }
    paymentId = preferred.id
  }

  if (!paymentId) {
    return {
      outcome: "not_found",
      paymentStatus: null,
      paymentId: null,
    }
  }

  const payment = await getMercadoPagoPayment(paymentId, input.accessToken)
  if (payment.externalReference !== input.orderNumber) {
    throw new Error("Mercado Pago reconciliation reference mismatch")
  }

  const result = await applyMercadoPagoPaymentEvent({
    orderNumber: input.orderNumber,
    paymentId: payment.id,
    incomingStatus: payment.status,
    statusDetail: payment.statusDetail,
    paidCents: mercadoPagoAmountToCents(payment.transactionAmount),
    currencyId: payment.currencyId,
  })

  return toResult(result)
}
