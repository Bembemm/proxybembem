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
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"

export function AccountLoginForm({ next }: { next: string }) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<AccountFieldErrors>({})
  const [authInvalid, setAuthInvalid] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "")
    const password = String(form.get("password") ?? "")
    const nextErrors: AccountFieldErrors = {
      email: validateAccountEmail(email),
      password: validateAccountLoginPassword(password),
    }

    setErrors(nextErrors)
    setAuthInvalid(false)
    setMessage(null)
    if (hasAccountFieldErrors(nextErrors)) return

    setPending(true)
    try {
      const response = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: unknown
            message?: unknown
          }
        | null

      if (!response.ok || payload?.ok !== true) {
        const invalidCredentials = response.status === 400 || response.status === 401
        setAuthInvalid(invalidCredentials)

        if (invalidCredentials) {
          setMessage("E-mail ou senha incorretos.")
        } else if (typeof payload?.message === "string") {
          setMessage(payload.message)
        } else {
          setMessage("Não foi possível entrar agora. Tente novamente.")
        }
        return
      }

      // KingHost/reverse proxies may not reliably preserve a large SSR auth
      // Set-Cookie header returned through fetch. Verify that the browser can
      // actually see the authenticated customer before navigating. If not,
      // persist the same validated login directly with the browser-scoped
      // Supabase client.
      const browserSupabase = createSupabaseBrowserClient()
      const normalizedEmail = email.trim().toLowerCase()
      const { data: currentUserData } = await browserSupabase.auth.getUser()
      const currentEmail = currentUserData.user?.email?.trim().toLowerCase() ?? null

      if (currentEmail !== normalizedEmail) {
        const { data: browserLogin, error: browserLoginError } =
          await browserSupabase.auth.signInWithPassword({ email, password })

        if (browserLoginError || !browserLogin.session) {
          setAuthInvalid(true)
          setMessage("E-mail ou senha incorretos.")
          return
        }
      }

      window.location.assign(next)
    } catch {
      setMessage("Não foi possível entrar agora. Tente novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
          onChange={() => {
            setAuthInvalid(false)
            setMessage(null)
          }}
          aria-invalid={Boolean(errors.email) || authInvalid}
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
          onChange={() => setAuthInvalid(false)}
          aria-invalid={Boolean(errors.password) || authInvalid}
          aria-describedby={errors.password ? "login-password-error" : undefined}
          className={inputClass}
        />
        <FieldError id="login-password-error" message={errors.password} />
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
        <Link href={`/criar-conta?next=${encodeURIComponent(next)}`} className="text-violet-700 hover:underline">
          Criar conta
        </Link>
      </div>
    </form>
  )
}
