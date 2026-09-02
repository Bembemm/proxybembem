export const FULFILLMENT_STATUSES = [
  "awaiting_payment",
  "awaiting_production",
  "in_production",
  "ready_to_ship",
  "shipped",
  "completed",
  "canceled",
] as const

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number]

const STATUS_SET = new Set<string>(FULFILLMENT_STATUSES)

const ADMIN_TRANSITIONS: Readonly<Record<FulfillmentStatus, readonly FulfillmentStatus[]>> = {
  awaiting_payment: ["canceled"],
  awaiting_production: ["in_production", "canceled"],
  in_production: ["ready_to_ship", "canceled"],
  ready_to_ship: ["shipped", "canceled"],
  shipped: ["completed"],
  completed: [],
  canceled: [],
}

export function isFulfillmentStatus(value: unknown): value is FulfillmentStatus {
  return typeof value === "string" && STATUS_SET.has(value)
}

export function allowedAdminFulfillmentTransitions(
  status: FulfillmentStatus,
): readonly FulfillmentStatus[] {
  return ADMIN_TRANSITIONS[status]
}

export function assertAdminFulfillmentTransition(input: {
  paymentStatus: string
  from: FulfillmentStatus
  to: FulfillmentStatus
}): void {
  if (!ADMIN_TRANSITIONS[input.from].includes(input.to)) {
    throw new Error("invalid fulfillment transition")
  }

  if (
    input.from === "awaiting_production" &&
    input.to === "in_production" &&
    input.paymentStatus !== "approved"
  ) {
    throw new Error("approved payment required")
  }
}
