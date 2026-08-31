"use client"

import { useState, type FormEvent } from "react"
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
        setMessage("Não foi possível entrar. Verifique os dados e tente novamente.")
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
      <label className="flex flex-col gap-2 text-sm font-medium">
        E-mail
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border bg-background px-3 py-2 font-normal"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium">
        Senha
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-md border bg-background px-3 py-2 font-normal"
        />
      </label>

      {message ? (
        <p role="alert" className="text-sm text-destructive">
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
