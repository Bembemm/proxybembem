"use client"

import { useState } from "react"

import { FieldError } from "@/components/ui/field-error"
import { validateAccountEmail } from "@/lib/account-form"

const SUCCESS_MESSAGE =
  "Se existir um cadastro pendente para esse e-mail, enviaremos uma nova confirmação."

export function ConfirmationResendForm() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | undefined>()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "")
    const emailError = validateAccountEmail(email)
    setError(emailError)
    setMessage(null)
    if (emailError) return

    setPending(true)
    try {
      const response = await fetch("/api/account/confirmation-resend", {
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
          : response.ok
            ? SUCCESS_MESSAGE
            : "Não foi possível concluir agora. Tente novamente.",
      )
    } catch {
      setMessage("Não foi possível concluir agora. Tente novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-3 text-left" noValidate>
      <div>
        <label htmlFor="confirmation-email" className="text-sm font-semibold text-slate-800">
          E-mail do cadastro
        </label>
        <input
          id="confirmation-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "confirmation-email-error" : undefined}
          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <FieldError id="confirmation-email-error" message={error} />
      </div>
      {message ? <p role="status" className="text-sm leading-6 text-slate-600">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-60"
      >
        {pending ? "Enviando..." : "Reenviar e-mail de confirmação"}
      </button>
    </form>
  )
}
