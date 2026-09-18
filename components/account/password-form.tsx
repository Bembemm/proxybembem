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

function recoveryFallbackMessage(status: number) {
  if (status === 409) {
    return "Já existe uma tentativa em andamento. Aguarde alguns segundos e tente novamente com este mesmo link."
  }
  if (status === 429) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente com este mesmo link."
  }
  if (status >= 500) {
    return "O serviço teve uma falha temporária. Aguarde alguns segundos e tente novamente com este mesmo link."
  }
  return "Não foi possível redefinir a senha agora."
}

export function PasswordForm({ recovery = false }: { recovery?: boolean } = {}) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<AccountFieldErrors>({})

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const currentPassword = String(form.get("currentPassword") ?? "")
    const password = String(form.get("password") ?? "")
    const confirmPassword = String(form.get("confirmPassword") ?? "")
    const nextErrors: AccountFieldErrors = {
      currentPassword:
        !recovery && (currentPassword.length < 8 || currentPassword.length > 128)
          ? "Informe sua senha atual."
          : undefined,
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
      const endpoint = recovery
        ? "/api/account/password-recovery"
        : "/api/account/password"
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recovery ? { password } : { currentPassword, password }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: unknown; message?: unknown }
        | null

      if (!response.ok || payload?.ok !== true) {
        setMessage(
          typeof payload?.message === "string"
            ? payload.message
            : recovery
              ? recoveryFallbackMessage(response.status)
              : "Não foi possível alterar a senha agora.",
        )
        return
      }

      formElement.reset()
      setErrors({})
      if (recovery) {
        window.location.assign("/entrar?senha=alterada")
        return
      }
      setMessage("Senha alterada.")
    } catch {
      setMessage(
        recovery
          ? "Não foi possível contatar o serviço. Aguarde alguns segundos e tente novamente com este mesmo link."
          : "Não foi possível alterar a senha agora.",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {!recovery ? (
        <div className="space-y-1.5">
          <label htmlFor="currentPassword" className="text-sm font-semibold text-slate-800">Senha atual</label>
          <PasswordInput
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            maxLength={128}
            aria-invalid={Boolean(errors.currentPassword)}
            aria-describedby={errors.currentPassword ? "current-password-error" : undefined}
            className={inputClass}
          />
          <FieldError id="current-password-error" message={errors.currentPassword} />
        </div>
      ) : null}
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
        {pending
          ? recovery
            ? "Redefinindo..."
            : "Alterando..."
          : recovery
            ? "Redefinir senha"
            : "Alterar senha"}
      </button>
    </form>
  )
}
