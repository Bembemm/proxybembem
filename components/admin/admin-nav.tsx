import {
  ClipboardList,
  Factory,
  LayoutDashboard,
  Package,
  Plug,
  Settings,
  type LucideIcon,
} from "lucide-react"

export type AdminSection =
  | "overview"
  | "orders"
  | "production"
  | "products"
  | "settings"
  | "integrations"

const NAV_ITEMS: ReadonlyArray<{
  section: AdminSection
  label: string
  href: string
  icon: LucideIcon
}> = [
  { section: "overview", label: "Visão geral", href: "/admin", icon: LayoutDashboard },
  { section: "orders", label: "Pedidos", href: "/admin/pedidos", icon: ClipboardList },
  { section: "production", label: "Produção", href: "/admin/producao", icon: Factory },
  { section: "products", label: "Produtos", href: "/admin/produtos", icon: Package },
  { section: "settings", label: "Configurações", href: "/admin/configuracoes", icon: Settings },
  {
    section: "integrations",
    label: "Integrações",
    href: "/admin/integrations/melhor-envio",
    icon: Plug,
  },
]

export function AdminNav({ activeSection }: { activeSection: AdminSection }) {
  return (
    <nav aria-label="Navegação administrativa" className="grid gap-1.5">
      {NAV_ITEMS.map((item) => {
        const active = item.section === activeSection
        const Icon = item.icon

        return (
          <a
            key={item.section}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "flex min-h-11 items-center gap-3 rounded-xl bg-violet-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm"
                : "flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            }
          >
            <Icon className="size-4.5 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        )
      })}
    </nav>
  )
}
