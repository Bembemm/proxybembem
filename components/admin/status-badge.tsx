import type { FulfillmentStatus } from "../../lib/server/fulfillment.ts"

const PAYMENT_LABELS: Readonly<Record<string, string>> = {
  pending: "Pendente",
  approved: "Aprovado",
  refunded: "Reembolsado",
  charged_back: "Chargeback",
  manual_review: "Revisão manual",
  in_process: "Em processamento",
  rejected: "Recusado",
  cancelled: "Cancelado",
}

const FULFILLMENT_LABELS: Readonly<Record<FulfillmentStatus, string>> = {
  awaiting_payment: "Aguardando pagamento",
  awaiting_production: "Aguardando produção",
  in_production: "Em produção",
  ready_to_ship: "Pronto para envio",
  shipped: "Enviado",
  completed: "Concluído",
  canceled: "Cancelado",
}

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
  const label = PAYMENT_LABELS[value] ?? "Status desconhecido"
  const tone = PAYMENT_LABELS[value] ? paymentTone(value) : "neutral"

  return <Badge label={label} tone={tone} />
}

export function FulfillmentStatusBadge({ value }: { value: FulfillmentStatus }) {
  return <Badge label={FULFILLMENT_LABELS[value]} tone={fulfillmentTone(value)} />
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
