import { AlertTriangle, Search } from "lucide-react"
import { AdminShell } from "../../../components/admin/admin-shell.tsx"
import {
  FulfillmentStatusBadge,
  PaymentStatusBadge,
} from "../../../components/admin/status-badge.tsx"
import { requireAdminPageAccess } from "../../../lib/server/admin-auth.ts"
import {
  listAdminOrders,
  type AdminOrderAttentionSeverity,
  type AdminOrderListRow,
} from "../../../lib/server/admin-orders.ts"
import {
  isFulfillmentStatus,
  type FulfillmentStatus,
} from "../../../lib/server/fulfillment.ts"

const PAYMENT_FILTER_RE = /^[a-z][a-z0-9_]{0,99}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PAGE_SIZE = 25
const MAX_PAGE = 401

type PageSearchParams = Promise<{
  q?: string | string[]
  payment?: string | string[]
  fulfillment?: string | string[]
  attention?: string | string[]
  from?: string | string[]
  to?: string | string[]
  page?: string | string[]
}>

type NormalizedFilters = {
  query?: string
  paymentStatus?: string
  fulfillmentStatus?: FulfillmentStatus
  attentionRequired?: boolean
  from?: string
  to?: string
  page: number
}

export const dynamic = "force-dynamic"

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parsePage(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return 1
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_PAGE ? parsed : 1
}

function parsePayment(value: string | undefined) {
  const normalized = value?.trim() ?? ""
  return PAYMENT_FILTER_RE.test(normalized) ? normalized : undefined
}

function parseFulfillment(value: string | undefined) {
  return value && isFulfillmentStatus(value) ? value : undefined
}

function parseAttention(value: string | undefined) {
  if (value === "1") return true
  if (value === "0") return false
  return undefined
}

function parseCalendarDate(value: string | undefined) {
  if (!value || !DATE_RE.test(value)) return undefined
  const [yearText, monthText, dayText] = value.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : undefined
}

function normalizeFilters(params: Awaited<PageSearchParams>): NormalizedFilters {
  const rawQuery = firstParam(params.q)?.trim() ?? ""
  const query = rawQuery ? rawQuery.slice(0, 100) : undefined
  const paymentStatus = parsePayment(firstParam(params.payment))
  const fulfillmentStatus = parseFulfillment(firstParam(params.fulfillment))
  const attentionRequired = parseAttention(firstParam(params.attention))
  let from = parseCalendarDate(firstParam(params.from))
  let to = parseCalendarDate(firstParam(params.to))

  if (from && to && from > to) {
    from = undefined
    to = undefined
  }

  return {
    query,
    paymentStatus,
    fulfillmentStatus,
    attentionRequired,
    from,
    to,
    page: parsePage(firstParam(params.page)),
  }
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100)
}

function formatLocalDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function attentionTone(severity: AdminOrderAttentionSeverity | null) {
  if (severity === "critical") return "bg-rose-50 text-rose-700 ring-rose-200"
  if (severity === "warning") return "bg-amber-50 text-amber-800 ring-amber-200"
  return "bg-slate-100 text-slate-700 ring-slate-200"
}

function attentionLabel(severity: AdminOrderAttentionSeverity | null) {
  if (severity === "critical") return "Crítica"
  if (severity === "warning") return "Atenção"
  return "Informação"
}

function buildPageHref(filters: NormalizedFilters, page: number) {
  const search = new URLSearchParams()
  if (filters.query) search.set("q", filters.query)
  if (filters.paymentStatus) search.set("payment", filters.paymentStatus)
  if (filters.fulfillmentStatus) search.set("fulfillment", filters.fulfillmentStatus)
  if (filters.attentionRequired !== undefined) {
    search.set("attention", filters.attentionRequired ? "1" : "0")
  }
  if (filters.from) search.set("from", filters.from)
  if (filters.to) search.set("to", filters.to)
  search.set("page", String(page))
  return `/admin/pedidos?${search.toString()}`
}

function OrderCard({ order }: { order: AdminOrderListRow }) {
  const totalCents = order.total_cents ?? order.subtotal_cents

  return (
    <article className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/admin/pedidos/${order.id}`}
            className="font-semibold text-slate-950 transition hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          >
            {order.order_number}
          </a>
          {order.open_attention_count > 0 ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${attentionTone(order.open_attention_severity)}`}
            >
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {order.open_attention_count} · {attentionLabel(order.open_attention_severity)}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-sm font-medium text-slate-700">{order.customer_name}</p>
        <p className="mt-1 text-xs text-slate-500">{formatLocalDate(order.created_at)}</p>
      </div>

      <div className="flex flex-wrap gap-2 md:flex-col md:items-start">
        <PaymentStatusBadge value={order.payment_status} />
        <FulfillmentStatusBadge value={order.fulfillment_status} />
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-3 md:block md:border-0 md:pt-0 md:text-right">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-1 font-semibold text-slate-950">{formatMoney(totalCents)}</p>
        </div>
        <a
          href={`/admin/pedidos/${order.id}`}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 md:mt-3"
        >
          Ver detalhes
        </a>
      </div>
    </article>
  )
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: PageSearchParams
}) {
  await requireAdminPageAccess({ touch: true })

  const params = await searchParams
  const filters = normalizeFilters(params)
  const result = await listAdminOrders({
    query: filters.query,
    paymentStatus: filters.paymentStatus,
    fulfillmentStatus: filters.fulfillmentStatus,
    attentionRequired: filters.attentionRequired,
    from: filters.from,
    to: filters.to,
    sort: "newest",
    page: filters.page,
    pageSize: 25,
  })

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
  const hasPrevious = result.page > 1
  const hasNext = result.page < totalPages

  return (
    <AdminShell
      activeSection="orders"
      title="Pedidos"
      description="Consulte pedidos, pagamento, produção e alertas operacionais sem alterar o estado financeiro do Mercado Pago."
    >
      <div className="space-y-6">
        <form method="get" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="sm:col-span-2 lg:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Buscar
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  name="q"
                  type="search"
                  maxLength={100}
                  defaultValue={filters.query ?? ""}
                  placeholder="Pedido, cliente ou WhatsApp"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Pagamento
              </span>
              <input
                name="payment"
                type="text"
                maxLength={100}
                pattern="[a-z][a-z0-9_]{0,99}"
                defaultValue={filters.paymentStatus ?? ""}
                placeholder="Ex.: approved"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Produção
              </span>
              <select
                name="fulfillment"
                defaultValue={filters.fulfillmentStatus ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              >
                <option value="">Todos</option>
                <option value="awaiting_payment">Aguardando pagamento</option>
                <option value="awaiting_production">Aguardando produção</option>
                <option value="in_production">Em produção</option>
                <option value="ready_to_ship">Pronto para envio</option>
                <option value="shipped">Enviado</option>
                <option value="completed">Concluído</option>
                <option value="canceled">Cancelado</option>
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Alertas
              </span>
              <select
                name="attention"
                defaultValue={
                  filters.attentionRequired === true
                    ? "1"
                    : filters.attentionRequired === false
                      ? "0"
                      : ""
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              >
                <option value="">Todos</option>
                <option value="1">Com alerta</option>
                <option value="0">Sem alerta</option>
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                De
              </span>
              <input
                name="from"
                type="date"
                defaultValue={filters.from ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Até
              </span>
              <input
                name="to"
                type="date"
                defaultValue={filters.to ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
            </label>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                Filtrar
              </button>
              <a
                href="/admin/pedidos"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Limpar
              </a>
            </div>
          </div>
        </form>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Resultados</h2>
            <p className="mt-1 text-sm text-slate-500">
              {result.total} {result.total === 1 ? "pedido encontrado" : "pedidos encontrados"}
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Página {result.page} de {totalPages}
          </p>
        </div>

        {result.orders.length > 0 ? (
          <div className="grid gap-3">
            {result.orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
            <p className="font-medium text-slate-800">Nenhum pedido nesta página.</p>
            <p className="mt-1 text-sm text-slate-500">
              Ajuste os filtros ou volte uma página para continuar a consulta.
            </p>
          </div>
        )}

        <nav aria-label="Paginação dos pedidos" className="flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
          {hasPrevious ? (
            <a
              href={buildPageHref(filters, result.page - 1)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
            >
              Anterior
            </a>
          ) : (
            <span className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400">
              Anterior
            </span>
          )}

          {hasNext ? (
            <a
              href={buildPageHref(filters, result.page + 1)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
            >
              Próxima
            </a>
          ) : (
            <span className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400">
              Próxima
            </span>
          )}
        </nav>
      </div>
    </AdminShell>
  )
}
