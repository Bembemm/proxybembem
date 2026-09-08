import { ChevronRight, Truck } from "lucide-react"
import { AdminShell } from "../../components/admin/admin-shell"
import { requireAdminPageAccess } from "../../lib/server/admin-auth.ts"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  await requireAdminPageAccess({ touch: true })

  return (
    <AdminShell
      activeSection="overview"
      title="Painel administrativo"
      description="Acompanhe a operação da ProxyBembem e acesse as áreas administrativas protegidas."
    >
      <div className="min-w-0 max-w-3xl space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Integrações</h2>
          <p className="mt-1 text-sm text-slate-500">
            Serviços usados pela loja para pagamento, frete e operação.
          </p>
        </div>

        <a
          href="/admin/integrations/melhor-envio"
          className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-violet-200 hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:p-5"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-violet-700 shadow-sm ring-1 ring-slate-200">
            <Truck className="size-5" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-950">Melhor Envio</p>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              Autorize ou reautorize a conta usada no cálculo de frete.
            </p>
          </div>

          <ChevronRight
            className="size-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-violet-600"
            aria-hidden="true"
          />
        </a>
      </div>
    </AdminShell>
  )
}
