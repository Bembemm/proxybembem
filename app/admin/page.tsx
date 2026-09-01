import { ChevronRight, LogOut, ShieldCheck, Truck } from "lucide-react"
import { requireAdminPageAccess } from "../../lib/server/admin-auth.ts"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  await requireAdminPageAccess({ touch: true })

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight text-slate-950">ProxyBembem</p>
              <p className="text-sm text-slate-500">Painel administrativo</p>
            </div>
          </div>

          <form method="post" action="/api/admin/logout">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 sm:w-auto"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span>Sair</span>
            </button>
          </form>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-6 sm:px-7 sm:py-8">
            <div className="mb-3 inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
              Administração
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Painel administrativo
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Gerencie as integrações e configurações internas da ProxyBembem em um ambiente protegido.
            </p>
          </div>

          <div className="px-5 py-6 sm:px-7 sm:py-7">
            <div className="mb-4">
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
        </section>
      </div>
    </main>
  )
}
