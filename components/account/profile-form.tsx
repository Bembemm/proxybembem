"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export function ProfileForm({
  initialName,
  initialWhatsapp,
}: {
  initialName: string
  initialWhatsapp: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const form = new FormData(event.currentTarget)
    const name = String(form.get("name") ?? "")
    const whatsapp = String(form.get("whatsapp") ?? "")

    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, whatsapp }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: unknown; message?: unknown }
        | null

      if (!response.ok || payload?.ok !== true) {
        setMessage(
          typeof payload?.message === "string"
            ? payload.message
            : "Não foi possível salvar agora.",
        )
        return
      }

      setMessage("Dados salvos.")
      router.refresh()
    } catch {
      setMessage("Não foi possível salvar agora.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-semibold text-slate-800">Nome</label>
        <input id="name" name="name" defaultValue={initialName} required minLength={3} maxLength={100} autoComplete="name" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="whatsapp" className="text-sm font-semibold text-slate-800">WhatsApp</label>
        <input id="whatsapp" name="whatsapp" defaultValue={initialWhatsapp} required inputMode="tel" autoComplete="tel" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
      </div>
      {message ? <p role="status" className="text-sm text-slate-600">{message}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60">
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  )
}
