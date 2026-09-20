import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AccountLoginForm } from "@/components/account/login-form"
import { LoginConfirmationFlashCleanup } from "@/components/account/login-confirmation-flash-cleanup"
import { sanitizeCustomerLoginNext } from "@/lib/server/customer-account-actions"
import { getOptionalCustomerIdentity } from "@/lib/server/customer-auth"

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
    confirmado?: string | string[]
    email?: string | string[]
    erro?: string | string[]
  }>
}) {
  const params = await searchParams
  const next = sanitizeCustomerLoginNext(
    typeof params.next === "string" ? params.next : undefined,
  )
  const identity = await getOptionalCustomerIdentity()
  if (identity) {
    redirect(next)
  }

  const passwordChanged = params.senha === "alterada"
  const emailConfirmed = params.confirmado === "1"
  const emailChanged = params.email === "alterado"
  const callbackError = params.erro === "callback"
  const confirmationError = params.erro === "confirmacao"
  const recoveryError = params.erro === "recovery"
  const credentialError = params.erro === "credenciais"
  const rateLimitError = params.erro === "limite"
  const serviceError = params.erro === "servico"
  const requestError = params.erro === "requisicao"

  return (
    <section className="px-4 pb-16 pt-24 sm:pt-28">
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
        {emailConfirmed ? <LoginConfirmationFlashCleanup /> : null}
        {emailConfirmed ? (
          <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            E-mail confirmado. Entre com a senha criada no cadastro.
          </p>
        ) : null}
        {emailChanged ? (
          <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            Confirmação de alteração de e-mail recebida. Entre novamente para atualizar sua sessão.
          </p>
        ) : null}
        {confirmationError ? (
          <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            Este link de confirmação já foi utilizado ou expirou. Se sua conta já estiver confirmada, basta entrar.
          </p>
        ) : null}
        {recoveryError ? (
          <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            Este link de recuperação já foi utilizado ou expirou. Solicite um novo link se precisar redefinir a senha novamente.
          </p>
        ) : null}
        {callbackError ? (
          <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            Não foi possível confirmar este link. Solicite um novo cadastro ou tente novamente com um e-mail recente.
          </p>
        ) : null}
        {credentialError ? (
          <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
            E-mail ou senha incorretos.
          </p>
        ) : null}
        {rateLimitError ? (
          <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            Muitas tentativas de login. Aguarde alguns minutos e tente novamente.
          </p>
        ) : null}
        {serviceError || requestError ? (
          <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            Não foi possível entrar agora. Tente novamente.
          </p>
        ) : null}
        <AccountLoginForm next={next} />
      </div>
    </section>
  )
}
