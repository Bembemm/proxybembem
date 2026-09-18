"use client"

import { useState, type FormEvent } from "react"
import { createAdminSupabaseBrowserClient } from "../../../lib/supabase/client.ts"

async function activateAdminSession() {
  return fetch("/api/admin/session/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  })
}

export function SetupMfaForm() {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function startEnrollment() {
    if (busy || factorId) return
    setMessage(null)
    setBusy(true)

    try {
      const supabase = createAdminSupabaseBrowserClient()
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "ProxyBembem Admin",
      })
      if (error) {
        setMessage("Não foi possível iniciar o Authenticator.")
        return
      }

      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
    } catch {
      setMessage("Não foi possível iniciar o Authenticator.")
    } finally {
      setBusy(false)
    }
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !factorId) return

    const normalizedCode = code.trim()
    if (!/^\d{6}$/.test(normalizedCode)) {
      setMessage("Digite o código de 6 dígitos.")
      return
    }

    setMessage(null)
    setBusy(true)

    const supabase = createAdminSupabaseBrowserClient()
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

      const response = await activateAdminSession()
      if (response.status !== 204) {
        await supabase.auth.signOut({ scope: "local" })
        window.location.assign("/admin/login")
        return
      }

      window.location.assign("/admin")
    } catch {
      setMessage("Não foi possível confirmar o Authenticator. Tente novamente.")
    } finally {
      setBusy(false)
    }
  }

  if (!factorId || !qrCode) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Use um aplicativo Authenticator no celular. O QR Code só será criado quando você iniciar a configuração.
        </p>
        {message ? (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={startEnrollment}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {busy ? "Preparando..." : "Configurar Authenticator"}
        </button>
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={verifyEnrollment}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Escaneie este QR Code no aplicativo Authenticator do seu celular.
        </p>
        <img
          src={qrCode}
          alt="QR Code para configurar o Authenticator"
          className="h-56 w-56 rounded-md border bg-white p-2"
        />
      </div>

      <label className="flex flex-col gap-2 text-sm font-medium">
        Código de 6 dígitos
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-invalid={Boolean(message)}
          aria-describedby={message ? "admin-setup-mfa-error" : undefined}
          className="rounded-md border bg-background px-3 py-2 font-normal tracking-widest"
        />
      </label>

      {message ? (
        <p id="admin-setup-mfa-error" role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {busy ? "Confirmando..." : "Confirmar Authenticator"}
      </button>
    </form>
  )
}
