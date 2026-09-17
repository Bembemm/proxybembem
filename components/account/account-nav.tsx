"use client"

import Link from "next/link"
import { LayoutDashboard, PackageSearch, ShieldCheck, UserRound } from "lucide-react"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { href: "/minha-conta", label: "Visão geral", icon: LayoutDashboard },
  { href: "/minha-conta/pedidos", label: "Pedidos", icon: PackageSearch },
  { href: "/minha-conta/perfil", label: "Perfil", icon: UserRound },
  { href: "/minha-conta/seguranca", label: "Segurança", icon: ShieldCheck },
] as const

function isActivePath(pathname: string, href: string) {
  if (href === "/minha-conta") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AccountNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navegação da conta"
      className={mobile ? "flex gap-2 overflow-x-auto pb-1" : "space-y-1"}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={[
              "flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
              mobile ? "shrink-0 whitespace-nowrap" : "w-full",
              active
                ? "bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-100"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
            ].join(" ")}
          >
            <Icon className="size-4.5 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
