import type { OrderRecord } from "./server/orders.ts"

export interface OrderDisplayItem {
  title: string
  quantity: number
  unitPriceCents: number
}

export interface OrderDisplayAddress {
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  cep: string
}

export interface OrderDisplayData {
  orderNumber: string
  paymentStatus: string
  items: OrderDisplayItem[]
  subtotalCents: number
  shippingCents: number | null
  totalCents: number
  carrierName: string | null
  serviceName: string | null
  deliveryDays: number | null
  address: OrderDisplayAddress | null
}

function completeAddress(order: OrderRecord): OrderDisplayAddress | null {
  if (
    !order.address_street ||
    !order.address_number ||
    !order.address_neighborhood ||
    !order.address_city ||
    !order.address_state
  ) {
    return null
  }

  return {
    street: order.address_street,
    number: order.address_number,
    complement: order.address_complement || null,
    neighborhood: order.address_neighborhood,
    city: order.address_city,
    state: order.address_state,
    cep: order.cep,
  }
}

export function toOrderDisplayData(order: OrderRecord): OrderDisplayData {
  return {
    orderNumber: order.order_number,
    paymentStatus: order.payment_status,
    items: order.items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    totalCents: order.total_cents ?? order.subtotal_cents,
    carrierName: order.shipping_carrier_name,
    serviceName: order.shipping_service_name,
    deliveryDays: order.shipping_delivery_days,
    address: completeAddress(order),
  }
}
