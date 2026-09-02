"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export function OrderClaimForm({ publicToken }: { publicToken: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    setPending(true)
    setMessage(null)

    try {
      const response = await fetch("/api/account/orders/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: unknown; message?: unknown }
        | null

      if (!response.ok || payload?.ok !== true) {
        setMessage(
          typeof payload?.message === "string"
            ? payload.message
            : "Não foi possível adicionar este pedido à sua conta.",
        )
        return
      }

      setMessage("Pedido adicionado à sua conta.")
      router.refresh()
    } catch {
      setMessage("Não foi possível adicionar este pedido à sua conta.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Adicionando..." : "Adicionar à minha conta"}
      </button>
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </form>
  )
}
