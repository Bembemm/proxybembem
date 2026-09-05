"use client"

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js"
import { useEffect, useRef, useState } from "react"

import { FieldError } from "@/components/ui/field-error"
import { PasswordInput } from "@/components/ui/password-input"
import {
  hasAccountFieldErrors,
  type AccountFieldErrors,
  validateAccountPassword,
} from "@/lib/account-form"
import { getSupabaseBrowserConfig } from "@/lib/supabase/config"

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
const RECOVERY_STORAGE_KEY = "proxybembem-recovery-session"
const RECOVERY_MAX_AGE_SECONDS = 3600
const RECOVERY_FUTURE_SKEW_SECONDS = 300

type RecoveryStatus = "checking" | "ready" | "invalid"

function hasRecentRecoveryAmr(claims: unknown, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!claims || typeof claims !== "object") return false
  const amr = (claims as { amr?: unknown }).amr
  if (!Array.isArray(amr)) return false

  return amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false
    const method = (entry as { method?: unknown }).method
    const timestamp = (entry as { timestamp?: unknown }).timestamp
    if (method !== "recovery" || typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      return false
    }

    const age = nowSeconds - timestamp
    return age >= -RECOVERY_FUTURE_SKEW_SECONDS && age <= RECOVERY_MAX_AGE_SECONDS
  })
}

async function isRecentRecoverySession(client: SupabaseClient, session: Session | null) {
  if (!session?.access_token) return false
  const { data, error } = await client.auth.getClaims(session.access_token)
  return !error && hasRecentRecoveryAmr(data?.claims)
}

export function PasswordForm({ recovery = false }: { recovery?: boolean } = {}) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<AccountFieldErrors>({})
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>(
    recovery ? "checking" : "ready",
  )
  const recoveryClientRef = useRef<SupabaseClient | null>(null)

  useEffect(() => {
    if (!recovery) return

    let active = true
    let subscription: { unsubscribe(): void } | null = null

    try {
      const env = getSupabaseBrowserConfig()
      const supabase = createClient(env.url, env.publishableKey, {
        auth: {
          flowType: "implicit",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: false,
          storageKey: RECOVERY_STORAGE_KEY,
        },
      })
      recoveryClientRef.current = supabase

      const acceptSession = async (session: Session | null) => {
        const accepted = await isRecentRecoverySession(supabase, session).catch(() => false)
        if (!active) return
        setRecoveryStatus(accepted ? "ready" : "invalid")
      }

      const authListener = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          void acceptSession(session)
        }
      })
      subscription = authListener.data.subscription

      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (!active) return
          if (error) {
            setRecoveryStatus("invalid")
            return
          }
          void acceptSession(data.session)
        })
        .catch(() => {
          if (active) setRecoveryStatus("invalid")
        })
    } catch {
      setRecoveryStatus("invalid")
    }

    return () => {
      active = false
      subscription?.unsubscribe()
      recoveryClientRef.current = null
    }
  }, [recovery])

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
      if (recovery) {
        const supabase = recoveryClientRef.current
        if (!supabase || recoveryStatus !== "ready") {
          setMessage("Link de recuperação inválido ou expirado.")
          return
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (
          sessionError ||
          !(await isRecentRecoverySession(supabase, sessionData.session).catch(() => false))
        ) {
          setRecoveryStatus("invalid")
          setMessage("Link de recuperação inválido ou expirado.")
          return
        }

        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) {
          setMessage("Não foi possível redefinir a senha agora.")
          return
        }

        const { error: signOutError } = await supabase.auth.signOut({ scope: "global" })
        if (signOutError) {
          await supabase.auth.signOut({ scope: "local" }).catch(() => undefined)
          setMessage(
            "Senha redefinida, mas não foi possível encerrar todas as sessões. Entre novamente.",
          )
          return
        }

        formElement.reset()
        setErrors({})
        window.location.assign("/entrar?senha=alterada")
        return
      }

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
      setMessage(
        recovery
          ? "Não foi possível redefinir a senha agora."
          : "Não foi possível alterar a senha agora.",
      )
    } finally {
      setPending(false)
    }
  }

  if (recovery && recoveryStatus === "checking") {
    return <p role="status" className="text-sm text-slate-600">Validando link de recuperação...</p>
  }

  if (recovery && recoveryStatus === "invalid") {
    return (
      <p role="alert" className="text-sm text-slate-600">
        Este link de recuperação é inválido ou expirou. Solicite um novo e-mail de recuperação.
      </p>
    )
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
