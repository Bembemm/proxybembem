import type { Metadata } from "next"
import { AccountPasswordResetForm } from "@/components/account/password-reset-form"

export const metadata: Metadata = {
  title: "Recuperar senha",
  description: "Recupere o acesso à sua conta ProxyBembem.",
}

export default function ForgotPasswordPage() {
  return (
    <section className="px-4 pb-16 pt-24 sm:pt-28">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 space-y-2 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Recuperar senha</h1>
          <p className="text-sm text-slate-600">
            Se existir uma conta para o e-mail informado, enviaremos as instruções de recuperação.
          </p>
        </div>
        <AccountPasswordResetForm />
      </div>
    </section>
  )
}
