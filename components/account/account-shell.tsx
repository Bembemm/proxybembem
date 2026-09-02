import Link from "next/link"
import { LogoutForm } from "./logout-form"

const NAV_ITEMS = [
  { href: "/minha-conta", label: "Visão geral" },
  { href: "/minha-conta/pedidos", label: "Pedidos" },
  { href: "/minha-conta/perfil", label: "Perfil" },
  { href: "/minha-conta/seguranca", label: "Segurança" },
] as const

export function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-h-[70vh] px-4 pb-16 pt-24 sm:pt-28">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Minha conta</p>
          </div>
          <nav aria-label="Navegação da conta" className="flex gap-1 overflow-x-auto lg:flex-col">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-700"
              >
                {item.label}
              </Link>
            ))}
            <LogoutForm />
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </section>
  )
}
