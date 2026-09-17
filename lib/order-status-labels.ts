import type { FulfillmentStatus } from "./server/fulfillment.ts"

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

export function paymentStatusLabel(value: string) {
  return PAYMENT_LABELS[value] ?? "Status desconhecido"
}

export function fulfillmentStatusLabel(value: FulfillmentStatus) {
  return FULFILLMENT_LABELS[value]
}
