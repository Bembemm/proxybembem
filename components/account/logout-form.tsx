"use client"

import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function LogoutForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function logout() {
    if (pending) return
    setPending(true)
    try {
      const response = await fetch("/api/account/logout", {
        method: "POST",
      })
      if (response.ok) {
        router.push("/entrar")
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-60"
    >
      <LogOut className="size-4.5 shrink-0" aria-hidden="true" />
      <span>{pending ? "Saindo..." : "Sair"}</span>
    </button>
  )
}
