"use client"

import { useState } from "react"

import { FieldError } from "@/components/ui/field-error"
import { PasswordInput } from "@/components/ui/password-input"
import { validateAccountEmail } from "@/lib/account-form"

export function EmailChangeForm() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | undefined>()
  const [passwordError, setPasswordError] = useState<string | undefined>()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const email = String(form.get("email") ?? "")
    const currentPassword = String(form.get("currentPassword") ?? "")
    const nextEmailError = validateAccountEmail(email)
    const nextPasswordError =
      currentPassword.length < 8 || currentPassword.length > 128
        ? "Informe sua senha atual."
        : undefined

    setEmailError(nextEmailError)
    setPasswordError(nextPasswordError)
    setMessage(null)
    if (nextEmailError || nextPasswordError) return

    setPending(true)
    try {
      const response = await fetch("/api/account/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, currentPassword }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: unknown; message?: unknown }
        | null

      setMessage(
        typeof payload?.message === "string"
          ? payload.message
          : response.ok
            ? "Solicitação enviada. Confira seu e-mail."
            : "Não foi possível alterar o e-mail agora.",
      )
      if (response.ok && payload?.ok === true) {
        formElement.reset()
        setEmailError(undefined)
        setPasswordError(undefined)
      }
    } catch {
      setMessage("Não foi possível alterar o e-mail agora.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
      <div>
        <label htmlFor="new-account-email" className="text-sm font-semibold text-slate-800">
          Novo e-mail
        </label>
        <input
          id="new-account-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "new-account-email-error" : undefined}
          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <FieldError id="new-account-email-error" message={emailError} />
      </div>

      <div>
        <label htmlFor="email-current-password" className="text-sm font-semibold text-slate-800">
          Senha atual
        </label>
        <PasswordInput
          id="email-current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          minLength={8}
          maxLength={128}
          required
          aria-invalid={Boolean(passwordError)}
          aria-describedby={passwordError ? "email-current-password-error" : undefined}
          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <FieldError id="email-current-password-error" message={passwordError} />
      </div>

      {message ? <p role="status" className="text-sm leading-6 text-slate-600">{message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-60"
      >
        {pending ? "Enviando..." : "Alterar e-mail"}
      </button>
    </form>
  )
}
