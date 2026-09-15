import { getSupabaseEnv } from "./env.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INTERNAL_CODE_RE = /^[a-z][a-z0-9_]{2,63}$/
const SOURCE_RE = /^[a-z][a-z0-9_]{1,63}$/
const DASHBOARD_TIMEZONE = "America/Sao_Paulo" as const

export type DashboardAttentionSeverity = "critical" | "warning" | "info"

export interface DashboardPeriodValues {
  today: number
  week: number
  month: number
}

export interface DashboardFinancialRisk {
  manualReview: number
  refunded: number
  chargedBack: number
}

export interface DashboardOperations {
  awaitingProduction: number
  inProduction: number
  readyToShip: number
  shipped: number
}

export interface DashboardAttentionItem {
  orderId: string
  orderNumber: string
  customerName: string
  severity: DashboardAttentionSeverity
  flagCount: number
  primaryCode: string
  primarySource: string
  openedAt: string
}

export interface DashboardAttention {
  totalOrders: number
  criticalOrders: number
  warningOrders: number
  infoOrders: number
  topItems: DashboardAttentionItem[]
}

export interface DashboardProductSale {
  productId: number
  title: string
  quantity: number
}

export interface AdminDashboardSnapshot {
  asOf: string
  timezone: typeof DASHBOARD_TIMEZONE
  ordersCreated: DashboardPeriodValues
  approvedGrossCents: DashboardPeriodValues
  reversedCents: DashboardPeriodValues
  financialRisk: DashboardFinancialRisk
  operations: DashboardOperations
  attention: DashboardAttention
  productsThisMonth: DashboardProductSale[]
}

const ATTENTION_LABELS: Readonly<Record<string, string>> = {
  payment_manual_review: "Pagamento precisa de revisão",
  payment_refunded: "Pagamento reembolsado",
  payment_charged_back: "Pagamento contestado (chargeback)",
  canceled_paid_order: "Pedido pago foi cancelado",
  notification_missing_email: "Contato por e-mail indisponível",
  notification_delivery_failed: "Falha no envio de notificação",
  shipment_provider_failure: "Falha na operação de envio",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function isNonEmptyBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
}

function isTimestamp(value: unknown): value is string {
  return (
    isNonEmptyBoundedString(value, 64) &&
    Number.isFinite(Date.parse(value))
  )
}

function parsePeriodValues(value: unknown): DashboardPeriodValues {
  if (
    !isRecord(value) ||
    !isNonnegativeSafeInteger(value.today) ||
    !isNonnegativeSafeInteger(value.week) ||
    !isNonnegativeSafeInteger(value.month)
  ) {
    throw new Error("Admin dashboard storage returned an invalid response")
  }

  return {
    today: value.today,
    week: value.week,
    month: value.month,
  }
}

function parseFinancialRisk(value: unknown): DashboardFinancialRisk {
  if (
    !isRecord(value) ||
    !isNonnegativeSafeInteger(value.manualReview) ||
    !isNonnegativeSafeInteger(value.refunded) ||
    !isNonnegativeSafeInteger(value.chargedBack)
  ) {
    throw new Error("Admin dashboard storage returned an invalid response")
  }

  return {
    manualReview: value.manualReview,
    refunded: value.refunded,
    chargedBack: value.chargedBack,
  }
}

function parseOperations(value: unknown): DashboardOperations {
  if (
    !isRecord(value) ||
    !isNonnegativeSafeInteger(value.awaitingProduction) ||
    !isNonnegativeSafeInteger(value.inProduction) ||
    !isNonnegativeSafeInteger(value.readyToShip) ||
    !isNonnegativeSafeInteger(value.shipped)
  ) {
    throw new Error("Admin dashboard storage returned an invalid response")
  }

  return {
    awaitingProduction: value.awaitingProduction,
    inProduction: value.inProduction,
    readyToShip: value.readyToShip,
    shipped: value.shipped,
  }
}

function parseAttentionItem(value: unknown): DashboardAttentionItem {
  if (!isRecord(value)) {
    throw new Error("Admin dashboard storage returned an invalid response")
  }

  const severity = value.severity
  if (
    typeof value.orderId !== "string" ||
    !UUID_RE.test(value.orderId) ||
    !isNonEmptyBoundedString(value.orderNumber, 100) ||
    !isNonEmptyBoundedString(value.customerName, 500) ||
    (severity !== "critical" && severity !== "warning" && severity !== "info") ||
    !isPositiveSafeInteger(value.flagCount) ||
    typeof value.primaryCode !== "string" ||
    !INTERNAL_CODE_RE.test(value.primaryCode) ||
    typeof value.primarySource !== "string" ||
    !SOURCE_RE.test(value.primarySource) ||
    !isTimestamp(value.openedAt)
  ) {
    throw new Error("Admin dashboard storage returned an invalid response")
  }

  return {
    orderId: value.orderId,
    orderNumber: value.orderNumber,
    customerName: value.customerName,
    severity,
    flagCount: value.flagCount,
    primaryCode: value.primaryCode,
    primarySource: value.primarySource,
    openedAt: value.openedAt,
  }
}

function parseAttention(value: unknown): DashboardAttention {
  if (
    !isRecord(value) ||
    !isNonnegativeSafeInteger(value.totalOrders) ||
    !isNonnegativeSafeInteger(value.criticalOrders) ||
    !isNonnegativeSafeInteger(value.warningOrders) ||
    !isNonnegativeSafeInteger(value.infoOrders) ||
    !Array.isArray(value.topItems) ||
    value.topItems.length > 5
  ) {
    throw new Error("Admin dashboard storage returned an invalid response")
  }

  if (
    value.criticalOrders + value.warningOrders + value.infoOrders !==
    value.totalOrders
  ) {
    throw new Error("Admin dashboard storage returned an invalid response")
  }

  const topItems = value.topItems.map(parseAttentionItem)
  const uniqueOrderIds = new Set(topItems.map((item) => item.orderId))
  if (uniqueOrderIds.size !== topItems.length || topItems.length > value.totalOrders) {
    throw new Error("Admin dashboard storage returned an invalid response")
  }

  return {
    totalOrders: value.totalOrders,
    criticalOrders: value.criticalOrders,
    warningOrders: value.warningOrders,
    infoOrders: value.infoOrders,
    topItems,
  }
}

function parseProductSale(value: unknown): DashboardProductSale {
  if (
    !isRecord(value) ||
    !isPositiveSafeInteger(value.productId) ||
    !isNonEmptyBoundedString(value.title, 500) ||
    !isPositiveSafeInteger(value.quantity)
  ) {
    throw new Error("Admin dashboard storage returned an invalid response")
  }

  return {
    productId: value.productId,
    title: value.title,
    quantity: value.quantity,
  }
}

function parseAdminDashboardSnapshot(value: unknown): AdminDashboardSnapshot {
  if (
    !isRecord(value) ||
    !isTimestamp(value.asOf) ||
    value.timezone !== DASHBOARD_TIMEZONE ||
    !Array.isArray(value.productsThisMonth) ||
    value.productsThisMonth.length > 10
  ) {
    throw new Error("Admin dashboard storage returned an invalid response")
  }

  const productsThisMonth = value.productsThisMonth.map(parseProductSale)
  const uniqueProductIds = new Set(productsThisMonth.map((product) => product.productId))
  if (uniqueProductIds.size !== productsThisMonth.length) {
    throw new Error("Admin dashboard storage returned an invalid response")
  }

  return {
    asOf: value.asOf,
    timezone: DASHBOARD_TIMEZONE,
    ordersCreated: parsePeriodValues(value.ordersCreated),
    approvedGrossCents: parsePeriodValues(value.approvedGrossCents),
    reversedCents: parsePeriodValues(value.reversedCents),
    financialRisk: parseFinancialRisk(value.financialRisk),
    operations: parseOperations(value.operations),
    attention: parseAttention(value.attention),
    productsThisMonth,
  }
}

async function adminDashboardRequest(path: string, init?: RequestInit) {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()

  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: supabaseSecretKey,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Supabase admin dashboard request failed", {
      operation: init?.method ?? "GET",
      resource: path.split("?")[0],
      status: "network",
    })
    throw new Error("Admin dashboard storage request failed")
  }

  if (!response.ok) {
    console.error("Supabase admin dashboard request failed", {
      operation: init?.method ?? "GET",
      resource: path.split("?")[0],
      status: response.status,
    })
    throw new Error("Admin dashboard storage request failed")
  }

  return response
}

export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const response = await adminDashboardRequest("rpc/admin_get_dashboard_snapshot", {
    method: "POST",
    body: JSON.stringify({}),
  })

  return parseAdminDashboardSnapshot((await response.json()) as unknown)
}

export function getAttentionReasonLabel(code: string): string {
  return ATTENTION_LABELS[code] ?? "Pedido requer atenção"
}
