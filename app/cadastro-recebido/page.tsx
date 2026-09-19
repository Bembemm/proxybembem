import type { Metadata } from "next"
import Link from "next/link"
import { MailCheck } from "lucide-react"
import { ConfirmationResendForm } from "@/components/account/confirmation-resend-form"
import { sanitizeCustomerLoginNext } from "@/lib/server/customer-account-actions"

export const metadata: Metadata = {
  title: "Confira seu e-mail",
  description: "Confirme seu e-mail para ativar sua conta ProxyBembem.",
}

export default async function SignupReceivedPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const params = await searchParams
  const next = sanitizeCustomerLoginNext(
    typeof params.next === "string" ? params.next : undefined,
  )

  return (
    <section className="px-4 pb-16 pt-24 sm:pt-28">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-violet-50 text-violet-700">
          <MailCheck className="h-8 w-8" aria-hidden="true" />
        </div>

        <h1 className="text-3xl font-bold text-slate-900">Confira seu e-mail</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Seu cadastro foi recebido. Enviamos um link de confirmação para o e-mail informado.
          Clique nele para ativar sua conta.
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
          <p className="text-sm font-semibold text-slate-800">Não encontrou o e-mail?</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Aguarde alguns instantes e confira também as pastas de spam ou lixo eletrônico.
          </p>
        </div>

        <ConfirmationResendForm next={next} />

        <Link
          href={`/entrar?next=${encodeURIComponent(next)}`}
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700"
        >
          Ir para entrar
        </Link>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          Você precisa confirmar o e-mail antes de entrar pela primeira vez.
        </p>
      </div>
    </section>
  )
}
