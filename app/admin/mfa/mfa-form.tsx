"use client"

import { useState, type FormEvent } from "react"
import { createSupabaseBrowserClient } from "../../../lib/supabase/client.ts"

async function activateAdminSession() {
  return fetch("/api/admin/session/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  })
}

export function MfaForm({
  factorId,
  alreadyVerified,
}: {
  factorId: string
  alreadyVerified: boolean
}) {
  const [code, setCode] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function finishActivation() {
    const supabase = createSupabaseBrowserClient()
    const response = await activateAdminSession()
    if (response.status !== 204) {
      await supabase.auth.signOut({ scope: "local" })
      window.location.assign("/admin/login")
      return false
    }

    window.location.assign("/admin")
    return true
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    if (alreadyVerified) {
      setBusy(true)
      try {
        await finishActivation()
      } catch {
        setMessage("Não foi possível concluir o acesso. Entre novamente.")
      } finally {
        setBusy(false)
      }
      return
    }

    const normalizedCode = code.trim()
    if (!/^\d{6}$/.test(normalizedCode)) {
      setMessage("Digite o código de 6 dígitos.")
      return
    }

    setMessage(null)
    setBusy(true)
    const supabase = createSupabaseBrowserClient()

    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId })
      if (challenge.error) {
        setMessage("Código inválido. Tente novamente.")
        return
      }

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: normalizedCode,
      })
      if (verify.error) {
        setMessage("Código inválido. Tente novamente.")
        return
      }

      await finishActivation()
    } catch {
      setMessage("Não foi possível validar o código. Tente novamente.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      {alreadyVerified ? (
        <p className="text-sm text-muted-foreground">
          O Authenticator já foi confirmado nesta sessão. Continue para validar a sessão administrativa.
        </p>
      ) : (
        <label className="flex flex-col gap-2 text-sm font-medium">
          Código do Authenticator
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="rounded-md border bg-background px-3 py-2 font-normal tracking-widest"
          />
        </label>
      )}

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {busy ? "Validando..." : alreadyVerified ? "Continuar" : "Confirmar código"}
      </button>
    </form>
  )
}
