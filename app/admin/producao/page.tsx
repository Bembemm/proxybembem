import { AlertTriangle, ArrowRight } from "lucide-react"
import { AdminShell } from "../../../components/admin/admin-shell.tsx"
import { PaymentStatusBadge } from "../../../components/admin/status-badge.tsx"
import { requireAdminPageAccess } from "../../../lib/server/admin-auth.ts"
import {
  listAdminOrders,
  type AdminOrderListRow,
  type AdminOrderListResult,
} from "../../../lib/server/admin-orders.ts"

export const dynamic = "force-dynamic"

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

function attentionLabel(order: AdminOrderListRow) {
  if (order.open_attention_count === 0) return null

  const severity = order.open_attention_severity ?? "info"
  const label = severity === "critical" ? "Crítica" : severity === "warning" ? "Atenção" : "Info"

  return `${label}: ${order.open_attention_count}`
}

function QueueCard({ order }: { order: AdminOrderListRow }) {
  const attention = attentionLabel(order)

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-950">{order.order_number}</p>
            <p className="mt-1 text-sm text-slate-600">{order.customer_name}</p>
          </div>
          <PaymentStatusBadge value={order.payment_status} />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Criado</dt>
            <dd className="mt-1 text-slate-700">{formatLocalDate(order.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {formatMoney(order.total_cents ?? order.subtotal_cents)}
            </dd>
          </div>
        </dl>

        {attention ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>{attention}</span>
          </div>
        ) : null}

        <a
          href={`/admin/pedidos/${order.id}`}
          className="inline-flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
        >
          Ver pedido
          <ArrowRight className="size-4" aria-hidden="true" />
        </a>
      </div>
    </article>
  )
}

function ProductionQueue({
  title,
  result,
}: {
  title: string
  result: AdminOrderListResult
}) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
          {result.total}
        </span>
      </div>

      {result.orders.length > 0 ? (
        <div className="grid gap-3">
          {result.orders.map((order) => (
            <QueueCard key={order.id} order={order} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-sm text-slate-500">
          Nenhum pedido nesta fila.
        </p>
      )}
    </section>
  )
}

export default async function AdminProductionPage() {
  await requireAdminPageAccess({ touch: true })

  const [awaitingProduction, inProduction, readyToShip] = await Promise.all([
    listAdminOrders({
      fulfillmentStatus: "awaiting_production",
      sort: "oldest",
      page: 1,
      pageSize: 50,
    }),
    listAdminOrders({
      fulfillmentStatus: "in_production",
      sort: "oldest",
      page: 1,
      pageSize: 50,
    }),
    listAdminOrders({
      fulfillmentStatus: "ready_to_ship",
      sort: "oldest",
      page: 1,
      pageSize: 50,
    }),
  ])

  return (
    <AdminShell
      activeSection="production"
      title="Produção"
      description="Filas operacionais em ordem de chegada para acompanhar o preparo até o envio."
    >
      <div className="grid gap-4 xl:grid-cols-3">
        <ProductionQueue title="Aguardando produção" result={awaitingProduction} />
        <ProductionQueue title="Em produção" result={inProduction} />
        <ProductionQueue title="Pronto para envio" result={readyToShip} />
      </div>
    </AdminShell>
  )
}
