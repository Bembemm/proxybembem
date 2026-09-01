export interface PaymentTransitionInput {
  currentStatus: string
  currentPaymentId: string | null
  incomingStatus: string
  incomingPaymentId: string
  amountMatches: boolean
  statusDetail: string | null
}

export interface PaymentUpdate {
  paymentId: string
  paymentStatus: string
  paymentStatusDetail: string | null
}

const REVERSAL_STATUSES = new Set(["refunded", "charged_back"])

export function derivePaymentUpdate(input: PaymentTransitionInput): PaymentUpdate | null {
  if (input.currentStatus === "approved") {
    if (input.currentPaymentId !== input.incomingPaymentId) {
      return null
    }

    if (input.incomingStatus === "approved") {
      return {
        paymentId: input.incomingPaymentId,
        paymentStatus: "approved",
        paymentStatusDetail: input.statusDetail,
      }
    }

    if (REVERSAL_STATUSES.has(input.incomingStatus)) {
      return {
        paymentId: input.incomingPaymentId,
        paymentStatus: input.incomingStatus,
        paymentStatusDetail: input.statusDetail,
      }
    }

    return null
  }

  if (REVERSAL_STATUSES.has(input.currentStatus)) {
    if (input.currentPaymentId !== input.incomingPaymentId) return null
    if (!REVERSAL_STATUSES.has(input.incomingStatus)) return null
  }

  if (input.incomingStatus === "approved" && !input.amountMatches) {
    return {
      paymentId: input.incomingPaymentId,
      paymentStatus: "manual_review",
      paymentStatusDetail: "amount_or_currency_mismatch",
    }
  }

  return {
    paymentId: input.incomingPaymentId,
    paymentStatus: input.incomingStatus,
    paymentStatusDetail: input.statusDetail,
  }
}
