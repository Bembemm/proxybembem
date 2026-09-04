"use client"

import Link from "next/link"
import { useState } from "react"

import { FieldError } from "@/components/ui/field-error"
import { PasswordInput } from "@/components/ui/password-input"
import {
  hasAccountFieldErrors,
  type AccountFieldErrors,
  validateAccountEmail,
  validateAccountName,
  validateAccountPassword,
  validateAccountWhatsapp,
} from "@/lib/account-form"
import { formatWhatsapp } from "@/lib/checkout"

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"

export function AccountSignupForm() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [whatsapp, setWhatsapp] = useState("")
  const [errors, setErrors] = useState<AccountFieldErrors>({})

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get("name") ?? "")
    const email = String(form.get("email") ?? "")
    const password = String(form.get("password") ?? "")
    const confirmPassword = String(form.get("confirmPassword") ?? "")

    const nextErrors: AccountFieldErrors = {
      name: validateAccountName(name),
      email: validateAccountEmail(email),
      whatsapp: validateAccountWhatsapp(whatsapp),
      password: validateAccountPassword(password),
    }
    if (password !== confirmPassword) {
      nextErrors.confirmPassword = "As senhas não coincidem."
    }

    setErrors(nextErrors)
    setMessage(null)
    if (hasAccountFieldErrors(nextErrors)) return

    const input = { name, email, whatsapp, password }

    setPending(true)
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
      if (response.ok && payload?.ok === true) {
        formElement.reset()
        setWhatsapp("")
        setErrors({})
      }
    } catch {
      setMessage("Não foi possível criar a conta agora.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-semibold text-slate-800">Nome</label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          required
          minLength={3}
          maxLength={100}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "signup-name-error" : undefined}
          className={inputClass}
        />
        <FieldError id="signup-name-error" message={errors.name} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-semibold text-slate-800">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "signup-email-error" : undefined}
          className={inputClass}
        />
        <FieldError id="signup-email-error" message={errors.email} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="whatsapp" className="text-sm font-semibold text-slate-800">WhatsApp</label>
        <input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          maxLength={15}
          value={whatsapp}
          onChange={(event) => setWhatsapp(formatWhatsapp(event.target.value))}
          placeholder="(44) 99999-9999"
          aria-invalid={Boolean(errors.whatsapp)}
          aria-describedby={errors.whatsapp ? "signup-whatsapp-error" : undefined}
          className={inputClass}
        />
        <FieldError id="signup-whatsapp-error" message={errors.whatsapp} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-semibold text-slate-800">Senha</label>
        <PasswordInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "signup-password-error" : undefined}
          className={inputClass}
        />
        <FieldError id="signup-password-error" message={errors.password} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-semibold text-slate-800">Confirmar senha</label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-invalid={Boolean(errors.confirmPassword)}
          aria-describedby={errors.confirmPassword ? "signup-confirm-password-error" : undefined}
          className={inputClass}
        />
        <FieldError id="signup-confirm-password-error" message={errors.confirmPassword} />
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
