import type { Metadata } from "next"
import { AccountSignupForm } from "@/components/account/signup-form"

export const metadata: Metadata = {
  title: "Criar conta",
  description: "Crie sua conta ProxyBembem para acompanhar pedidos.",
}

export default function SignupPage() {
  return (
    <section className="min-h-[70vh] px-4 pb-16 pt-24 sm:pt-28">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 space-y-2 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Criar conta</h1>
          <p className="text-sm text-slate-600">
            Depois do cadastro, você precisa verificar seu e-mail antes de entrar.
          </p>
        </div>
        <AccountSignupForm />
      </div>
    </section>
  )
}
