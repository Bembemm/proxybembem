import { CircleUserRound } from "lucide-react"
import { AccountNav } from "./account-nav"
import { LogoutForm } from "./logout-form"

function AccountIdentity() {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 p-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
        <CircleUserRound className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold tracking-tight text-slate-950">ProxyBembem</p>
        <p className="text-xs text-slate-500">Minha conta</p>
      </div>
    </div>
  )
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-h-screen bg-slate-100 px-4 pb-12 pt-24 sm:px-6 sm:pb-16 sm:pt-28 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
        <aside className="hidden lg:block">
          <div className="sticky top-24 flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <AccountIdentity />
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <AccountNav />
            </div>
            <div className="border-t border-slate-200 p-3">
              <LogoutForm />
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:hidden">
            <AccountIdentity />
            <div className="p-3">
              <AccountNav mobile />
            </div>
            <div className="border-t border-slate-200 p-3">
              <LogoutForm />
            </div>
          </div>

          {children}
        </main>
      </div>
    </section>
  )
}
