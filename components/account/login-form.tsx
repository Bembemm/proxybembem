"use client"

import Link from "next/link"
import { useState } from "react"

import { FieldError } from "@/components/ui/field-error"
import { PasswordInput } from "@/components/ui/password-input"
import {
  hasAccountFieldErrors,
  type AccountFieldErrors,
  validateAccountEmail,
  validateAccountLoginPassword,
} from "@/lib/account-form"

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"

export function AccountLoginForm({ next }: { next: string }) {
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<AccountFieldErrors>({})

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault()
      return
    }

    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "")
    const password = String(form.get("password") ?? "")
    const nextErrors: AccountFieldErrors = {
      email: validateAccountEmail(email),
      password: validateAccountLoginPassword(password),
    }

    setErrors(nextErrors)

    if (hasAccountFieldErrors(nextErrors)) {
      event.preventDefault()
      return
    }

    setPending(true)
  }

  return (
    <form
      action="/api/account/login"
      method="post"
      onSubmit={handleSubmit}
      className="space-y-4"
      noValidate
    >
      <input type="hidden" name="next" value={next} />
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
          maxLength={254}
          onChange={() =>
            setErrors((current) => ({ ...current, email: undefined }))
          }
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "login-email-error" : undefined}
          className={inputClass}
        />
        <FieldError id="login-email-error" message={errors.email} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-semibold text-slate-800">
          Senha
        </label>
        <PasswordInput
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          onChange={() =>
            setErrors((current) => ({ ...current, password: undefined }))
          }
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "login-password-error" : undefined}
          className={inputClass}
        />
        <FieldError id="login-password-error" message={errors.password} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <Link href={`/esqueci-a-senha?next=${encodeURIComponent(next)}`} className="text-violet-700 hover:underline">
          Esqueci minha senha
        </Link>
        <Link href={`/criar-conta?next=${encodeURIComponent(next)}`} className="text-violet-700 hover:underline">
          Criar conta
        </Link>
      </div>
    </form>
  )
}
