"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function AccountLoginForm({ next }: { next: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "")
    const password = String(form.get("password") ?? "")

    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: unknown; message?: unknown }
        | null

      if (!response.ok || payload?.ok !== true) {
        setMessage(
          typeof payload?.message === "string"
            ? payload.message
            : "E-mail ou senha inválidos.",
        )
        return
      }

      router.push(next)
      router.refresh()
    } catch {
      setMessage("Não foi possível entrar agora. Tente novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-semibold text-slate-800">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-semibold text-slate-800">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          maxLength={128}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </div>
      {message ? <p role="status" className="text-sm text-slate-600">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <Link href="/esqueci-a-senha" className="text-violet-700 hover:underline">
          Esqueci minha senha
        </Link>
        <Link href="/criar-conta" className="text-violet-700 hover:underline">
          Criar conta
        </Link>
      </div>
    </form>
  )
}
