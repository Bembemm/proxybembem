"use client"

import { LogOut, Menu, ShieldCheck, X } from "lucide-react"
import { AdminNav, type AdminSection } from "./admin-nav"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"

export function AdminMobileNav({ activeSection }: { activeSection: AdminSection }) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">ProxyBembem</p>
          <p className="text-xs text-slate-500">Painel administrativo</p>
        </div>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            aria-label="Abrir menu administrativo"
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
                  <ShieldCheck className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="truncate text-sm font-semibold text-slate-950">
                    ProxyBembem
                  </DialogTitle>
                  <p className="text-xs text-slate-500">Painel administrativo</p>
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
        </DialogContent>
      </Dialog>
    </div>
  )
}
