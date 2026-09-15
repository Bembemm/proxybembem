import { AlertTriangle, ChevronRight } from "lucide-react"
import {
  getAttentionReasonLabel,
  type DashboardAttention,
  type DashboardAttentionSeverity,
} from "../../lib/server/admin-dashboard.ts"

function severityLabel(severity: DashboardAttentionSeverity) {
  if (severity === "critical") return "Crítica"
  if (severity === "warning") return "Atenção"
  return "Informação"
}

function severityTone(severity: DashboardAttentionSeverity) {
  if (severity === "critical") return "bg-rose-50 text-rose-700 ring-rose-200"
  if (severity === "warning") return "bg-amber-50 text-amber-800 ring-amber-200"
  return "bg-sky-50 text-sky-700 ring-sky-200"
}

function formatOpenedAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatAge(openedAt: string, asOf: string) {
  const diffMinutes = Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(openedAt)) / 60_000))
  if (diffMinutes < 60) return `${Math.max(1, diffMinutes)} min`
  const hours = Math.floor(diffMinutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  return `${days} d`
}

export function DashboardAttentionCenter({
  attention,
  asOf,
}: {
  attention: DashboardAttention
  asOf: string
}) {
  return (
    <section
      aria-labelledby="dashboard-attention-title"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4.5 text-amber-600" aria-hidden="true" />
            <h2 id="dashboard-attention-title" className="font-semibold text-slate-950">
              Requer atenção
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Problemas abertos que somem apenas quando a causa real é resolvida.
          </p>
        </div>
        <a
          href="/admin/pedidos?attention=1"
          className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          Ver todos
          <ChevronRight className="size-4" aria-hidden="true" />
        </a>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-4">
        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Pedidos</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{attention.totalOrders}</p>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium text-rose-600">Críticos</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{attention.criticalOrders}</p>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium text-amber-700">Atenção</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{attention.warningOrders}</p>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium text-sky-700">Informação</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{attention.infoOrders}</p>
        </div>
      </div>

      {attention.topItems.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="font-medium text-slate-800">Nenhum pedido requer atenção agora.</p>
          <p className="mt-1 text-sm text-slate-500">As filas operacionais estão sem alertas abertos.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {attention.topItems.map((item) => (
            <a
              key={item.orderId}
              href={`/admin/pedidos/${item.orderId}`}
              className="group grid gap-3 px-4 py-4 transition hover:bg-violet-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${severityTone(item.severity)}`}>
                    {severityLabel(item.severity)}
                  </span>
                  <span className="text-sm font-semibold text-slate-950">{item.orderNumber}</span>
                  {item.flagCount > 1 ? (
                    <span className="text-xs font-medium text-slate-500">{item.flagCount} alertas</span>
                  ) : null}
                </div>
                <p className="mt-2 font-medium text-slate-800">
                  {getAttentionReasonLabel(item.primaryCode)}
                </p>
                <p className="mt-1 truncate text-sm text-slate-500">{item.customerName}</p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <div className="text-left text-xs text-slate-500 sm:text-right">
                  <p>Aberto há {formatAge(item.openedAt, asOf)}</p>
                  <p className="mt-0.5">{formatOpenedAt(item.openedAt)}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-violet-600" aria-hidden="true" />
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
