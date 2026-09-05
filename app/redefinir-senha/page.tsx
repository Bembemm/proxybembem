import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { PasswordForm } from "@/components/account/password-form"
import {
  RECOVERY_TOKEN_COOKIE,
  hasRecentRecoveryAmr,
  isValidRecoveryTokenHash,
} from "@/lib/server/password-recovery"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Redefinir senha",
  description: "Escolha uma nova senha para sua conta ProxyBembem.",
}

export const dynamic = "force-dynamic"

export default async function ResetPasswordPage() {
  const cookieStore = await cookies()
  const tokenHash = cookieStore.get(RECOVERY_TOKEN_COOKIE)?.value
  let canRecover = isValidRecoveryTokenHash(tokenHash)

  if (!canRecover) {
    try {
      const supabase = await createSupabaseServerClient()
      const { data, error } = await supabase.auth.getClaims()
      canRecover = !error && hasRecentRecoveryAmr(data?.claims)
    } catch {
      canRecover = false
    }
  }

  if (!canRecover) {
    redirect("/entrar?erro=recovery")
  }

  return (
    <section className="min-h-[70vh] px-4 pb-16 pt-24 sm:pt-28">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 space-y-2 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Redefinir senha</h1>
          <p className="text-sm text-slate-600">
            Escolha uma nova senha com pelo menos 8 caracteres.
          </p>
        </div>

        <PasswordForm recovery />

        <p className="mt-6 text-center text-sm text-slate-600">
          <Link href="/entrar" className="font-semibold text-violet-700 hover:underline">
            Voltar para entrar
          </Link>
        </p>
      </div>
    </section>
  )
}
