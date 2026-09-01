import { redirect } from "next/navigation"
import { getAdminAuthEnv } from "../../../lib/server/env.ts"
import { validateAdminIdentity } from "../../../lib/server/admin-auth-core.ts"
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts"
import { MfaForm } from "./mfa-form.tsx"

export const dynamic = "force-dynamic"

export default async function AdminMfaPage() {
  const supabase = await createSupabaseServerClient()
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
  if (!verifiedTotp) {
    redirect("/admin/setup-mfa")
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Verificação em duas etapas</h1>
        <p className="text-sm text-muted-foreground">
          Confirme o acesso com o código do seu aplicativo Authenticator.
        </p>
      </div>
      <MfaForm
        factorId={verifiedTotp.id}
        alreadyVerified={identity.principal.aal === "aal2"}
      />
    </main>
  )
}
