import {
  CircleDollarSign,
  CircleSlash2,
  Factory,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  SearchCheck,
} from "lucide-react"
import type {
  DashboardFinancialRisk,
  DashboardOperations as DashboardOperationsValues,
} from "../../lib/server/admin-dashboard.ts"

function OperationCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof Factory
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
          <Icon className="size-4.5" aria-hidden="true" />
        </div>
        <span className="text-2xl font-bold tabular-nums text-slate-950">{value}</span>
      </div>
      <p className="mt-3 text-sm font-medium text-slate-700">{label}</p>
    </div>
  )
}

export function DashboardOperations({
  operations,
  financialRisk,
}: {
  operations: DashboardOperationsValues
  financialRisk: DashboardFinancialRisk
}) {
  return (
    <section aria-labelledby="dashboard-operations-title" className="space-y-4">
      <div>
        <h2 id="dashboard-operations-title" className="text-base font-semibold text-slate-950">
          Operação agora
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Filas atuais conforme o estado persistido de cada pedido.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperationCard label="Aguardando produção" value={operations.awaitingProduction} icon={PackageOpen} />
        <OperationCard label="Em produção" value={operations.inProduction} icon={Factory} />
        <OperationCard label="Pronto para envio" value={operations.readyToShip} icon={PackageCheck} />
        <OperationCard label="Enviados" value={operations.shipped} icon={CircleDollarSign} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Risco financeiro atual</p>
            <p className="mt-1 text-xs text-slate-500">Estados financeiros que merecem acompanhamento.</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 sm:min-w-[26rem]">
            <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <SearchCheck className="size-3.5" aria-hidden="true" />
                Em revisão
              </dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-slate-950">{financialRisk.manualReview}</dd>
            </div>
            <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Reembolsados
              </dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-slate-950">{financialRisk.refunded}</dd>
            </div>
            <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <CircleSlash2 className="size-3.5" aria-hidden="true" />
                Chargebacks
              </dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-slate-950">{financialRisk.chargedBack}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}
