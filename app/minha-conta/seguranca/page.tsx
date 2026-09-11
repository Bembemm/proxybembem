import type { Metadata } from "next"
import Link from "next/link"
import { PasswordForm } from "@/components/account/password-form"
import { requireCustomerPageAccess } from "@/lib/server/customer-auth"

export const metadata: Metadata = {
  title: "Segurança",
}

export default async function SecurityPage() {
  const identity = await requireCustomerPageAccess()

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-4 space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">Segurança</h1>
          <p className="text-sm text-slate-600">Seu e-mail de acesso é somente leitura nesta etapa.</p>
        </div>
        <label htmlFor="account-email" className="text-sm font-semibold text-slate-800">E-mail</label>
        <input
          id="account-email"
          value={identity.email}
          readOnly
          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-600"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-4 space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Alterar senha</h2>
          <p className="text-sm text-slate-600">Use uma senha com pelo menos 8 caracteres.</p>
        </div>
        <PasswordForm />
        <p className="mt-5 text-sm text-slate-600">
          Sem acesso à senha atual?{" "}
          <Link href="/esqueci-a-senha" className="font-semibold text-violet-700 hover:underline">
            Iniciar recuperação
          </Link>
        </p>
      </section>
    </div>
  )
}
