import type { Metadata } from "next"
import Link from "next/link"
import { AccountPage } from "@/components/account/account-page"
import { PasswordForm } from "@/components/account/password-form"
import { requireCustomerPageAccess } from "@/lib/server/customer-auth"

export const metadata: Metadata = {
  title: "Segurança",
}

export default async function SecurityPage() {
  const identity = await requireCustomerPageAccess()

  return (
    <AccountPage
      title="Segurança"
      description="Gerencie seu e-mail de acesso e mantenha sua senha protegida."
    >
      <div className="space-y-5">
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-950">E-mail de acesso</h2>
            <p className="mt-1 text-sm text-slate-600">Seu e-mail é somente leitura nesta etapa.</p>
          </div>
          <label htmlFor="account-email" className="text-sm font-semibold text-slate-800">E-mail</label>
          <input
            id="account-email"
            value={identity.email}
            readOnly
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-600"
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-950">Alterar senha</h2>
            <p className="mt-1 text-sm text-slate-600">Use uma senha com pelo menos 8 caracteres.</p>
          </div>
          <PasswordForm />
          <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600">
            Sem acesso à senha atual?{" "}
            <Link href="/esqueci-a-senha" className="font-semibold text-violet-700 hover:underline">
              Iniciar recuperação
            </Link>
          </p>
        </section>
      </div>
    </AccountPage>
  )
}
