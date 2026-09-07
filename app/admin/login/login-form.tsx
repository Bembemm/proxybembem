"use client"

import { useState, type FormEvent } from "react"
import { PasswordInput } from "../../../components/ui/password-input"
import { createSupabaseBrowserClient } from "../../../lib/supabase/client.ts"

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setMessage(null)
    setSubmitting(true)

    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage("E-mail ou senha incorretos.")
        return
      }

      window.location.assign("/admin/mfa")
    } catch {
      setMessage("Não foi possível entrar. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2 text-sm font-medium">
        <label htmlFor="admin-email">E-mail</label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(message)}
          aria-describedby={message ? "admin-login-error" : undefined}
          className="rounded-md border bg-background px-3 py-2 font-normal"
        />
      </div>

      <div className="flex flex-col gap-2 text-sm font-medium">
        <label htmlFor="admin-password">Senha</label>
        <PasswordInput
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(message)}
          aria-describedby={message ? "admin-login-error" : undefined}
          className="rounded-md border bg-background px-3 py-2 font-normal"
        />
      </div>

      {message ? (
        <p id="admin-login-error" role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {submitting ? "Entrando..." : "Entrar"}
      </button>
    </form>
  )
}
