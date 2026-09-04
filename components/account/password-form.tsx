"use client"

import { useState } from "react"

import { FieldError } from "@/components/ui/field-error"
import { PasswordInput } from "@/components/ui/password-input"
import {
  hasAccountFieldErrors,
  type AccountFieldErrors,
  validateAccountPassword,
} from "@/lib/account-form"

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"

export function PasswordForm() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<AccountFieldErrors>({})

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const password = String(form.get("password") ?? "")
    const confirmPassword = String(form.get("confirmPassword") ?? "")
    const nextErrors: AccountFieldErrors = {
      password: validateAccountPassword(password),
    }

    if (password !== confirmPassword) {
      nextErrors.confirmPassword = "As senhas não coincidem."
    }

    setErrors(nextErrors)
    setMessage(null)
    if (hasAccountFieldErrors(nextErrors)) return

    setPending(true)
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: unknown; message?: unknown }
        | null

      if (!response.ok || payload?.ok !== true) {
        setMessage(
          typeof payload?.message === "string"
            ? payload.message
            : "Não foi possível alterar a senha agora.",
        )
        return
      }

      formElement.reset()
      setErrors({})
      setMessage("Senha alterada.")
    } catch {
      setMessage("Não foi possível alterar a senha agora.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-semibold text-slate-800">Nova senha</label>
        <PasswordInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-update-error" : undefined}
          className={inputClass}
        />
        <FieldError id="password-update-error" message={errors.password} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-semibold text-slate-800">Confirmar nova senha</label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-invalid={Boolean(errors.confirmPassword)}
          aria-describedby={errors.confirmPassword ? "password-confirm-error" : undefined}
          className={inputClass}
        />
        <FieldError id="password-confirm-error" message={errors.confirmPassword} />
      </div>
      {message ? <p role="status" className="text-sm text-slate-600">{message}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60">
        {pending ? "Alterando..." : "Alterar senha"}
      </button>
    </form>
  )
}
