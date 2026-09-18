import { redirect } from "next/navigation"
import { getAdminAuthEnv } from "../../../lib/server/env.ts"
import { validateAdminIdentity } from "../../../lib/server/admin-auth-core.ts"
import { createAdminSupabaseServerClient } from "../../../lib/supabase/server.ts"
import { SetupMfaForm } from "./setup-mfa-form.tsx"

export const dynamic = "force-dynamic"

export default async function SetupMfaPage() {
  const supabase = await createAdminSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error) throw new Error("Admin identity unavailable")

  const identity = validateAdminIdentity({
    claims: data?.claims ?? null,
    adminUserId: getAdminAuthEnv().adminUserId,
    requireAal2: false,
  })

  if (!identity.ok) {
    redirect("/admin/login")
  }

  const factors = await supabase.auth.mfa.listFactors()
  if (factors.error) throw new Error("Admin MFA factors unavailable")

  const verifiedTotp = factors.data.totp.find((factor) => factor.status === "verified")
  if (verifiedTotp) {
    redirect("/admin/mfa")
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Configurar verificação em duas etapas</h1>
        <p className="text-sm text-muted-foreground">
          A área administrativa exige um código do seu aplicativo Authenticator em cada novo login.
        </p>
      </div>
      <SetupMfaForm />
    </main>
  )
}
