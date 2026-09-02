"use client"

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
      className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-violet-700 disabled:opacity-60"
    >
      {pending ? "Saindo..." : "Sair"}
    </button>
  )
}
