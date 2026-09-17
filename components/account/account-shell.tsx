"use client"

import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  Menu,
  PackageSearch,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { LogoutForm } from "./logout-form"

type AccountNavItem = {
  href: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: readonly AccountNavItem[] = [
  { href: "/minha-conta", label: "Visão geral", icon: LayoutDashboard },
  { href: "/minha-conta/pedidos", label: "Pedidos", icon: PackageSearch },
  { href: "/minha-conta/perfil", label: "Perfil", icon: UserRound },
  { href: "/minha-conta/seguranca", label: "Segurança", icon: ShieldCheck },
]

function isActivePath(pathname: string, href: string) {
  if (href === "/minha-conta") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

function accountPageHeading(pathname: string) {
  if (pathname.startsWith("/minha-conta/pedidos/")) {
    return {
      title: "Detalhes do pedido",
      description: "Acompanhe itens, entrega e o andamento do seu pedido.",
    }
  }
  if (pathname === "/minha-conta/pedidos") {
    return {
      title: "Meus pedidos",
      description: "Veja os pedidos vinculados à sua conta e acompanhe cada etapa.",
    }
  }
  if (pathname === "/minha-conta/perfil") {
    return {
      title: "Perfil",
      description: "Atualize seu nome e WhatsApp usados para suporte.",
    }
  }
  if (pathname === "/minha-conta/seguranca") {
    return {
      title: "Segurança",
      description: "Consulte seu e-mail de acesso e atualize sua senha.",
    }
  }
  return {
    title: "Minha conta",
    description: "Acompanhe seus pedidos e mantenha seus dados atualizados.",
  }
}

function AccountNav({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  return (
    <nav aria-label="Navegação da conta" className="grid gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href)
        const Icon = item.icon
        const link = (
          <Link
            key={item.href}
            prefetch={false}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
              active
                ? "bg-violet-50 text-violet-800"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            }`}
          >
            <Icon
              className={`size-4.5 shrink-0 ${active ? "text-violet-700" : "text-slate-400"}`}
              aria-hidden="true"
            />
            <span>{item.label}</span>
          </Link>
        )

        if (!mobile) return link
        return (
          <DialogClose asChild key={item.href}>
            {link}
          </DialogClose>
        )
      })}
    </nav>
  )
}

function AccountMobileNav({ pathname }: { pathname: string }) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
          <UserRound className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">ProxyBembem</p>
          <p className="text-xs text-slate-500">Painel do cliente</p>
        </div>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            aria-label="Abrir menu da conta"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </DialogTrigger>

        <DialogContent
          showCloseButton={false}
          className="left-0 top-0 h-dvh w-[min(88vw,20rem)] max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-y-0 border-l-0 p-0 sm:max-w-none"
        >
          <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                  <UserRound className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="truncate text-sm font-semibold text-slate-950">
                    ProxyBembem
                  </DialogTitle>
                  <p className="text-xs text-slate-500">Painel do cliente</p>
                </div>
              </div>

              <DialogClose asChild>
                <button
                  type="button"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                  aria-label="Fechar menu"
                >
                  <X className="size-5" aria-hidden="true" />
                  <span className="sr-only">Fechar menu</span>
                </button>
              </DialogClose>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <AccountNav pathname={pathname} mobile />
            </div>

            <div className="border-t border-slate-200 p-3">
              <LogoutForm />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const heading = accountPageHeading(pathname)

  return (
    <section className="min-h-[70vh] bg-slate-100 px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
        <aside className="hidden lg:block">
          <div className="sticky top-24 flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 p-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                <UserRound className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold tracking-tight text-slate-950">
                  ProxyBembem
                </p>
                <p className="text-xs text-slate-500">Painel do cliente</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <AccountNav pathname={pathname} />
            </div>

            <div className="border-t border-slate-200 p-3">
              <LogoutForm />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <AccountMobileNav pathname={pathname} />

          <main className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-6 sm:px-7 sm:py-8">
              <div className="mb-3 inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
                Minha conta
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                {heading.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                {heading.description}
              </p>
            </div>

            <div className="px-5 py-6 sm:px-7 sm:py-7">{children}</div>
          </main>
        </div>
      </div>
    </section>
  )
}
