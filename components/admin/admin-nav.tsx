export type AdminSection =
  | "overview"
  | "orders"
  | "production"
  | "integrations"

const NAV_ITEMS: ReadonlyArray<{
  section: AdminSection
  label: string
  href: string
}> = [
  { section: "overview", label: "Visão geral", href: "/admin" },
  { section: "orders", label: "Pedidos", href: "/admin/pedidos" },
  { section: "production", label: "Produção", href: "/admin/producao" },
  {
    section: "integrations",
    label: "Integrações",
    href: "/admin/integrations/melhor-envio",
  },
]

export function AdminNav({ activeSection }: { activeSection: AdminSection }) {
  return (
    <nav
      aria-label="Navegação administrativa"
      className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 sm:border-t-0 sm:pt-0"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.section === activeSection
        return (
          <a
            key={item.section}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
            }
          >
            {item.label}
          </a>
        )
      })}
    </nav>
  )
}
