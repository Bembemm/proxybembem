import { fulfillmentStatusLabel, paymentStatusLabel } from "../../lib/order-status-labels.ts"
import type { FulfillmentStatus } from "../../lib/server/fulfillment.ts"

const TONES = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-violet-50 text-violet-700 ring-violet-200",
} as const

function paymentTone(value: string): keyof typeof TONES {
  if (value === "approved") return "success"
  if (value === "refunded" || value === "charged_back" || value === "rejected") {
    return "danger"
  }
  if (value === "manual_review" || value === "pending" || value === "in_process") {
    return "warning"
  }
  return "neutral"
}

function fulfillmentTone(value: FulfillmentStatus): keyof typeof TONES {
  if (value === "completed") return "success"
  if (value === "canceled") return "danger"
  if (value === "in_production" || value === "ready_to_ship" || value === "shipped") {
    return "info"
  }
  return "warning"
}

export function PaymentStatusBadge({ value }: { value: string }) {
  return <Badge label={paymentStatusLabel(value)} tone={paymentTone(value)} />
}

export function FulfillmentStatusBadge({ value }: { value: FulfillmentStatus }) {
  return <Badge label={fulfillmentStatusLabel(value)} tone={fulfillmentTone(value)} />
}

function Badge({
  label,
  tone,
}: {
  label: string
  tone: keyof typeof TONES
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}
    >
      {label}
    </span>
  )
}
