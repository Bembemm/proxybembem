export const ORDER_NOTIFICATION_TYPES = [
  "payment_approved",
  "production_started",
  "ready_to_ship",
  "shipped",
  "delivered",
  "canceled",
  "refunded",
  "charged_back",
] as const

export type OrderNotificationType = (typeof ORDER_NOTIFICATION_TYPES)[number]

const TYPE_SET = new Set<string>(ORDER_NOTIFICATION_TYPES)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NIL_UUID = "00000000-0000-0000-0000-000000000000"
const ORDER_NUMBER_PATTERN = /^PB-[A-F0-9]{12}$/
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const SITE_ORIGIN = "https://www.proxybembem.com.br"

interface SafeItem {
  title: string
  unitPriceCents: number
  quantity: number
}

interface SafeAddress {
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  cep: string
}

export interface OrderNotificationPayload {
  version: 1
  type: OrderNotificationType
  orderId: string
  orderNumber: string
  orderUrl: string
  customerName: string
  items: SafeItem[]
  subtotalCents: number
  shippingCents: number | null
  totalCents: number
  address: SafeAddress
  carrierName: string | null
  serviceName: string | null
  trackingCode: string | null
}

export function isOrderNotificationType(value: unknown): value is OrderNotificationType {
  return typeof value === "string" && TYPE_SET.has(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  message: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(message)
  }
  return value
}

function requiredText(value: unknown, maxLength: number, message: string) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maxLength ||
    CONTROL_CHARS.test(value)
  ) {
    throw new Error(message)
  }
  return value
}

function optionalText(value: unknown, maxLength: number, message: string) {
  if (value === null || value === undefined) return null
  return requiredText(value, maxLength, message)
}

function cents(value: unknown, nullable: boolean, message: string): number | null {
  if (nullable && value === null) return null
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 1_000_000_000
  ) {
    throw new Error(message)
  }
  return value
}

function positiveInteger(value: unknown, max: number, message: string) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > max
  ) {
    throw new Error(message)
  }
  return value
}

function canonicalUuid(value: unknown, message: string) {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value) ||
    value.toLowerCase() === NIL_UUID
  ) {
    throw new Error(message)
  }
  return value.toLowerCase()
}

function orderNumber(value: unknown, message: string) {
  if (typeof value !== "string" || !ORDER_NUMBER_PATTERN.test(value)) {
    throw new Error(message)
  }
  return value
}

function safeItems(value: unknown, message: string): SafeItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error(message)
  }
  return value.map((candidate) => {
    if (!isRecord(candidate)) throw new Error(message)
    const price = cents(candidate.unitPriceCents, false, message)
    if (price === null) throw new Error(message)
    return {
      title: requiredText(candidate.title, 200, message),
      unitPriceCents: price,
      quantity: positiveInteger(candidate.quantity, 100, message),
    }
  })
}

function safeAddress(value: unknown, message: string): SafeAddress {
  if (!isRecord(value)) throw new Error(message)
  const state = requiredText(value.state, 2, message).toUpperCase()
  if (!/^[A-Z]{2}$/.test(state)) throw new Error(message)
  const rawCep = requiredText(value.cep, 9, message).replace(/\D/g, "")
  if (!/^\d{8}$/.test(rawCep)) throw new Error(message)
  return {
    street: requiredText(value.street, 160, message),
    number: requiredText(value.number, 30, message),
    complement: optionalText(value.complement, 120, message),
    neighborhood: requiredText(value.neighborhood, 120, message),
    city: requiredText(value.city, 120, message),
    state,
    cep: rawCep,
  }
}

function buildOrderUrl(orderId: string) {
  return `${SITE_ORIGIN}/minha-conta/pedidos/${orderId}`
}

export function buildOrderNotificationPayload(
  type: unknown,
  snapshot: unknown,
): OrderNotificationPayload {
  if (!isOrderNotificationType(type)) {
    throw new Error("Invalid notification type")
  }
  const message = "Invalid notification snapshot"
  if (!isRecord(snapshot)) throw new Error(message)

  const id = canonicalUuid(snapshot.orderId, message)
  const subtotal = cents(snapshot.subtotalCents, false, message)
  const shipping = cents(snapshot.shippingCents, true, message)
  const total = cents(snapshot.totalCents, false, message)
  if (subtotal === null || total === null) throw new Error(message)

  return {
    version: 1,
    type,
    orderId: id,
    orderNumber: orderNumber(snapshot.orderNumber, message),
    orderUrl: buildOrderUrl(id),
    customerName: requiredText(snapshot.customerName, 200, message),
    items: safeItems(snapshot.items, message),
    subtotalCents: subtotal,
    shippingCents: shipping,
    totalCents: total,
    address: safeAddress(snapshot.address, message),
    carrierName: optionalText(snapshot.carrierName, 120, message),
    serviceName: optionalText(snapshot.serviceName, 120, message),
    trackingCode: optionalText(snapshot.trackingCode, 120, message),
  }
}

function parsePayload(value: unknown): OrderNotificationPayload {
  const message = "Invalid notification payload"
  const row = exactRecord(
    value,
    [
      "version",
      "type",
      "orderId",
      "orderNumber",
      "orderUrl",
      "customerName",
      "items",
      "subtotalCents",
      "shippingCents",
      "totalCents",
      "address",
      "carrierName",
      "serviceName",
      "trackingCode",
    ],
    message,
  )
  if (row.version !== 1 || !isOrderNotificationType(row.type)) {
    throw new Error(message)
  }
  const id = canonicalUuid(row.orderId, message)
  const expectedUrl = buildOrderUrl(id)
  if (row.orderUrl !== expectedUrl) throw new Error(message)
  const subtotal = cents(row.subtotalCents, false, message)
  const shipping = cents(row.shippingCents, true, message)
  const total = cents(row.totalCents, false, message)
  if (subtotal === null || total === null) throw new Error(message)

  const addressRow = exactRecord(
    row.address,
    ["street", "number", "complement", "neighborhood", "city", "state", "cep"],
    message,
  )
  const address = safeAddress(addressRow, message)
  const items = safeItems(row.items, message)

  return {
    version: 1,
    type: row.type,
    orderId: id,
    orderNumber: orderNumber(row.orderNumber, message),
    orderUrl: expectedUrl,
    customerName: requiredText(row.customerName, 200, message),
    items,
    subtotalCents: subtotal,
    shippingCents: shipping,
    totalCents: total,
    address,
    carrierName: optionalText(row.carrierName, 120, message),
    serviceName: optionalText(row.serviceName, 120, message),
    trackingCode: optionalText(row.trackingCode, 120, message),
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function formatBrl(centsValue: number) {
  const whole = Math.floor(centsValue / 100).toLocaleString("pt-BR")
  const fraction = String(centsValue % 100).padStart(2, "0")
  return `R$ ${whole},${fraction}`
}

function formatCep(value: string) {
  return `${value.slice(0, 5)}-${value.slice(5)}`
}

function addressLines(address: SafeAddress) {
  return [
    `${address.street}, ${address.number}`,
    ...(address.complement ? [address.complement] : []),
    address.neighborhood,
    `${address.city} - ${address.state}`,
    `CEP ${formatCep(address.cep)}`,
  ]
}

function copyFor(payload: OrderNotificationPayload) {
  switch (payload.type) {
    case "payment_approved":
      return {
        subject: `Pagamento aprovado — pedido ${payload.orderNumber}`,
        title: "Pagamento aprovado",
        message: "Recebemos a confirmação do seu pagamento. Seu pedido seguirá para preparação.",
      }
    case "production_started":
      return {
        subject: `Seu pedido entrou em produção — ${payload.orderNumber}`,
        title: "Produção iniciada",
        message: "Seu pedido começou a ser preparado pela ProxyBembem.",
      }
    case "ready_to_ship":
      return {
        subject: `Seu pedido está pronto para envio — ${payload.orderNumber}`,
        title: "Pedido pronto para envio",
        message: "A produção terminou e seu pedido agora aguarda a postagem.",
      }
    case "shipped":
      return {
        subject: `Seu pedido foi enviado — ${payload.orderNumber}`,
        title: "Pedido enviado",
        message: "Seu pedido foi postado e já está a caminho.",
      }
    case "delivered":
      return {
        subject: `Seu pedido foi entregue — ${payload.orderNumber}`,
        title: "Pedido entregue",
        message: "A transportadora confirmou a entrega do seu pedido.",
      }
    case "canceled":
      return {
        subject: `Seu pedido foi cancelado — ${payload.orderNumber}`,
        title: "Pedido cancelado",
        message:
          "Seu pedido foi cancelado. A devolução do valor é um processo separado e, quando aplicável, você receberá uma confirmação financeira específica.",
      }
    case "refunded":
      return {
        subject: `Reembolso concluído — ${payload.orderNumber}`,
        title: "Reembolso concluído",
        message: "O reembolso do seu pedido foi concluído e confirmado pelo provedor de pagamento.",
      }
    case "charged_back":
      return {
        subject: `Pagamento revertido — ${payload.orderNumber}`,
        title: "Pagamento revertido",
        message: "O pagamento do seu pedido foi revertido pela instituição financeira.",
      }
  }
}

function paymentText(payload: OrderNotificationPayload) {
  const items = payload.items.map(
    (item) => `${item.title} — ${item.quantity} x ${formatBrl(item.unitPriceCents)}`,
  )
  return [
    "Itens:",
    ...items,
    "",
    `Subtotal: ${formatBrl(payload.subtotalCents)}`,
    `Frete: ${formatBrl(payload.shippingCents ?? 0)}`,
    `Total pago: ${formatBrl(payload.totalCents)}`,
    "",
    "Endereço de entrega:",
    ...addressLines(payload.address),
  ].join("\n")
}

function shipmentText(payload: OrderNotificationPayload) {
  const lines: string[] = []
  if (payload.carrierName) lines.push(`Transportadora: ${payload.carrierName}`)
  if (payload.serviceName) lines.push(`Serviço: ${payload.serviceName}`)
  if (payload.trackingCode) lines.push(`Código de rastreio: ${payload.trackingCode}`)
  return lines.join("\n")
}

function paymentHtml(payload: OrderNotificationPayload) {
  const items = payload.items
    .map(
      (item) =>
        `<li>${escapeHtml(item.title)} — ${item.quantity} x ${escapeHtml(formatBrl(item.unitPriceCents))}</li>`,
    )
    .join("")
  const address = addressLines(payload.address)
    .map((line) => escapeHtml(line))
    .join("<br>")
  return `<h3>Resumo do pedido</h3><ul>${items}</ul><p><strong>Subtotal:</strong> ${escapeHtml(formatBrl(payload.subtotalCents))}<br><strong>Frete:</strong> ${escapeHtml(formatBrl(payload.shippingCents ?? 0))}<br><strong>Total pago:</strong> ${escapeHtml(formatBrl(payload.totalCents))}</p><h3>Endereço de entrega</h3><p>${address}</p>`
}

function shipmentHtml(payload: OrderNotificationPayload) {
  const rows: string[] = []
  if (payload.carrierName) {
    rows.push(`<strong>Transportadora:</strong> ${escapeHtml(payload.carrierName)}`)
  }
  if (payload.serviceName) {
    rows.push(`<strong>Serviço:</strong> ${escapeHtml(payload.serviceName)}`)
  }
  if (payload.trackingCode) {
    rows.push(`<strong>Código de rastreio:</strong> ${escapeHtml(payload.trackingCode)}`)
  }
  return rows.length > 0 ? `<p>${rows.join("<br>")}</p>` : ""
}

export function renderOrderNotification(value: unknown) {
  const payload = parsePayload(value)
  const copy = copyFor(payload)
  const buttonLabel = payload.type === "shipped" ? "Acompanhar meu pedido" : "Ver meu pedido"
  const detailsText =
    payload.type === "payment_approved"
      ? paymentText(payload)
      : payload.type === "shipped"
        ? shipmentText(payload)
        : ""
  const detailsHtml =
    payload.type === "payment_approved"
      ? paymentHtml(payload)
      : payload.type === "shipped"
        ? shipmentHtml(payload)
        : ""

  const text = [
    "ProxyBembem",
    "",
    `Olá, ${payload.customerName}.`,
    copy.title,
    copy.message,
    ...(detailsText ? ["", detailsText] : []),
    "",
    `${buttonLabel}: ${payload.orderUrl}`,
    "",
    "Este é um e-mail transacional sobre o seu pedido.",
  ].join("\n")

  const html = `<!doctype html><html lang="pt-BR"><body><div style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;color:#171717;line-height:1.5"><p style="font-weight:700">ProxyBembem</p><p>Olá, ${escapeHtml(payload.customerName)}.</p><h2>${escapeHtml(copy.title)}</h2><p>${escapeHtml(copy.message)}</p>${detailsHtml}<p><a href="${escapeHtml(payload.orderUrl)}" style="display:inline-block;padding:12px 18px;background:#171717;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(buttonLabel)}</a></p><p style="font-size:12px;color:#666">Este é um e-mail transacional sobre o seu pedido.</p></div></body></html>`

  return {
    subject: copy.subject,
    text,
    html,
  }
}
