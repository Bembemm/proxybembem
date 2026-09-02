import type { ReactNode } from "react"
import { LogOut, ShieldCheck } from "lucide-react"
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
    <main className="min-h-screen overflow-x-hidden px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold tracking-tight text-slate-950">
                  ProxyBembem
                </p>
                <p className="text-sm text-slate-500">Painel administrativo</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
              <AdminNav activeSection={activeSection} />
              <form method="post" action="/api/admin/logout" className="shrink-0">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 sm:w-auto"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  <span>Sair</span>
                </button>
              </form>
            </div>
          </div>
        </header>

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
    </main>
  )
}
