"use client"

import { LogOut } from "lucide-react"
import { useState } from "react"

export function LogoutForm() {
  const [pending, setPending] = useState(false)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault()
      return
    }
    setPending(true)
  }

  return (
    <form action="/api/account/logout" method="post" onSubmit={handleSubmit}>
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        <LogOut className="size-4.5 shrink-0" aria-hidden="true" />
        <span>{pending ? "Saindo..." : "Sair"}</span>
      </button>
    </form>
  )
}
