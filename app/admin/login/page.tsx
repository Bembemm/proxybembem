import { redirect } from "next/navigation"
import { authorizeAdminAccess } from "../../../lib/server/admin-auth.ts"
import { LoginForm } from "./login-form.tsx"

export const dynamic = "force-dynamic"

export default async function AdminLoginPage() {
  const access = await authorizeAdminAccess({ touch: false })

  if (access.ok) {
    redirect("/admin")
  }

  if (access.reason === "mfa_required") {
    redirect("/admin/mfa")
  }

  if (access.reason === "unavailable") {
    throw new Error("Admin login unavailable")
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Administração</h1>
        <p className="text-sm text-muted-foreground">
          Entre com o e-mail e a senha da conta administrativa.
        </p>
      </div>
      <LoginForm />
    </main>
  )
}
