import type { ReactNode } from "react"
import { LogOut, ShieldCheck } from "lucide-react"
import { AdminMobileNav } from "./admin-mobile-nav"
import { AdminNav, type AdminSection } from "./admin-nav"

export function AdminShell({
  activeSection,
  title,
  description,
  children,
}: {
  activeSection: AdminSection
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
        <aside className="hidden lg:block">
          <div className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 p-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold tracking-tight text-slate-950">
                  ProxyBembem
                </p>
                <p className="text-xs text-slate-500">Painel administrativo</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <AdminNav activeSection={activeSection} />
            </div>

            <div className="border-t border-slate-200 p-3">
              <form method="post" action="/api/admin/logout">
                <button
                  type="submit"
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                >
                  <LogOut className="size-4.5 shrink-0" aria-hidden="true" />
                  <span>Sair</span>
                </button>
              </form>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <AdminMobileNav activeSection={activeSection} />

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-6 sm:px-7 sm:py-8">
              <div className="mb-3 inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
                Administração
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                {title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                {description}
              </p>
            </div>

            <div className="px-5 py-6 sm:px-7 sm:py-7">{children}</div>
          </section>
        </div>
      </div>
    </main>
  )
}
