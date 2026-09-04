import type { Metadata } from "next"
import { AccountLoginForm } from "@/components/account/login-form"
import { sanitizeCustomerLoginNext } from "@/lib/server/customer-account-actions"

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta ProxyBembem.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[]
    senha?: string | string[]
  }>
}) {
  const params = await searchParams
  const next = sanitizeCustomerLoginNext(
    typeof params.next === "string" ? params.next : undefined,
  )
  const passwordChanged = params.senha === "alterada"

  return (
    <section className="min-h-[70vh] px-4 pb-16 pt-24 sm:pt-28">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 space-y-2 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Entrar</h1>
          <p className="text-sm text-slate-600">Acompanhe seus pedidos e dados da sua conta.</p>
        </div>
        {passwordChanged ? (
          <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            Senha redefinida. Entre com sua nova senha.
          </p>
        ) : null}
        <AccountLoginForm next={next} />
      </div>
    </section>
  )
}
