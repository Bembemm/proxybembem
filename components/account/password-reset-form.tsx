"use client"

import Link from "next/link"
import { useState } from "react"

export function AccountPasswordResetForm() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "")

    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/account/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { message?: unknown }
        | null
      setMessage(
        typeof payload?.message === "string"
          ? payload.message
          : "Se existir uma conta para esse e-mail, enviaremos as instruções.",
      )
    } catch {
      setMessage("Não foi possível concluir agora. Tente novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-semibold text-slate-800">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
      </div>
      {message ? <p role="status" className="text-sm text-slate-600">{message}</p> : null}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60">
        {pending ? "Enviando..." : "Enviar instruções"}
      </button>
      <p className="text-center text-sm">
        <Link href="/entrar" className="text-violet-700 hover:underline">Voltar para entrar</Link>
      </p>
    </form>
  )
}
