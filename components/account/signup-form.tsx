"use client"

import Link from "next/link"
import { useState } from "react"

export function AccountSignupForm() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const input = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      whatsapp: String(form.get("whatsapp") ?? ""),
      password: String(form.get("password") ?? ""),
    }

    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/account/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: unknown; message?: unknown }
        | null
      setMessage(
        typeof payload?.message === "string"
          ? payload.message
          : response.ok
            ? "Confira seu e-mail para verificar a conta."
            : "Não foi possível criar a conta agora.",
      )
      if (response.ok && payload?.ok === true) formElement.reset()
    } catch {
      setMessage("Não foi possível criar a conta agora.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-semibold text-slate-800">Nome</label>
        <input id="name" name="name" autoComplete="name" required minLength={3} maxLength={100} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-semibold text-slate-800">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="whatsapp" className="text-sm font-semibold text-slate-800">WhatsApp</label>
        <input id="whatsapp" name="whatsapp" inputMode="tel" autoComplete="tel" required className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-semibold text-slate-800">Senha</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
      </div>
      {message ? <p role="status" className="text-sm text-slate-600">{message}</p> : null}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60">
        {pending ? "Criando..." : "Criar conta"}
      </button>
      <p className="text-center text-sm text-slate-600">
        Já tem uma conta? <Link href="/entrar" className="text-violet-700 hover:underline">Entrar</Link>
      </p>
    </form>
  )
}
