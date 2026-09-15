import {
  ChevronRight,
  ClipboardList,
  RotateCcw,
  Truck,
  WalletCards,
} from "lucide-react"
import { AdminShell } from "../../components/admin/admin-shell"
import { DashboardAttentionCenter } from "../../components/admin/dashboard-attention-center"
import { DashboardOperations } from "../../components/admin/dashboard-operations"
import { DashboardPeriodCard } from "../../components/admin/dashboard-period-card"
import { DashboardProductSales } from "../../components/admin/dashboard-product-sales"
import { requireAdminPageAccess } from "../../lib/server/admin-auth.ts"
import {
  getAdminDashboardSnapshot,
  type AdminDashboardSnapshot,
} from "../../lib/server/admin-dashboard.ts"

export const dynamic = "force-dynamic"

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100)
}

function IntegrationUtility() {
  return (
    <section aria-labelledby="dashboard-integrations-title" className="space-y-3">
      <div>
        <h2 id="dashboard-integrations-title" className="text-base font-semibold text-slate-950">
          Integrações
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Acesse configurações operacionais dos serviços conectados à loja.
        </p>
      </div>

      <a
        href="/admin/integrations/melhor-envio"
        className="group flex max-w-2xl items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-violet-200 hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:p-5"
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-violet-700 shadow-sm ring-1 ring-slate-200">
          <Truck className="size-5" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-950">Melhor Envio</p>
          <p className="mt-1 text-sm leading-5 text-slate-500">
            Gerencie a autorização usada no cálculo e na operação de envios.
          </p>
        </div>

        <ChevronRight
          className="size-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-violet-600"
          aria-hidden="true"
        />
      </a>
    </section>
  )
}

function DashboardUnavailable() {
  return (
    <section
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6"
    >
      <h2 className="font-semibold text-amber-950">
        Não foi possível carregar os indicadores agora.
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900/80">
        Os dados não foram substituídos por zeros. Tente novamente em instantes; as demais
        áreas administrativas continuam disponíveis pela navegação.
      </p>
    </section>
  )
}

function DashboardContent({ snapshot }: { snapshot: AdminDashboardSnapshot }) {
  return (
    <>
      <section aria-label="Resumo do período" className="grid gap-4 xl:grid-cols-3">
        <DashboardPeriodCard
          title="Pedidos"
          description="Pedidos criados no calendário da loja."
          today={formatCount(snapshot.ordersCreated.today)}
          week={formatCount(snapshot.ordersCreated.week)}
          month={formatCount(snapshot.ordersCreated.month)}
          icon={ClipboardList}
        />
        <DashboardPeriodCard
          title="Aprovado bruto"
          description="Valor aprovado pelo Mercado Pago no período."
          today={formatMoney(snapshot.approvedGrossCents.today)}
          week={formatMoney(snapshot.approvedGrossCents.week)}
          month={formatMoney(snapshot.approvedGrossCents.month)}
          icon={WalletCards}
        />
        <DashboardPeriodCard
          title="Revertido"
          description="Reembolsos e chargebacks registrados no período."
          today={formatMoney(snapshot.reversedCents.today)}
          week={formatMoney(snapshot.reversedCents.week)}
          month={formatMoney(snapshot.reversedCents.month)}
          icon={RotateCcw}
          tone="warning"
        />
      </section>

      <DashboardOperations
        operations={snapshot.operations}
        financialRisk={snapshot.financialRisk}
      />

      <DashboardAttentionCenter attention={snapshot.attention} asOf={snapshot.asOf} />

      <DashboardProductSales products={snapshot.productsThisMonth} />
    </>
  )
}

export default async function AdminPage() {
  await requireAdminPageAccess({ touch: true })

  let snapshot: AdminDashboardSnapshot | null = null
  try {
    snapshot = await getAdminDashboardSnapshot()
  } catch {
    snapshot = null
  }

  return (
    <AdminShell
      activeSection="overview"
      title="Painel administrativo"
      description="Acompanhe vendas, operação e alertas da ProxyBembem com dados autoritativos."
    >
      <div className="min-w-0 space-y-7">
        {snapshot ? <DashboardContent snapshot={snapshot} /> : <DashboardUnavailable />}
        <IntegrationUtility />
      </div>
    </AdminShell>
  )
}
