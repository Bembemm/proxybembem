import { AdminShell } from "../../../../components/admin/admin-shell"
import {
  MelhorEnvioSenderForm,
  type MelhorEnvioSenderFormProfile,
} from "../../../../components/admin/melhor-envio-sender-form"
import { requireAdminPageAccess } from "../../../../lib/server/admin-auth.ts"
import { getMelhorEnvioOAuthEnv } from "../../../../lib/server/env.ts"
import { loadCredential } from "../../../../lib/server/melhor-envio-oauth-repository.ts"
import {
  getShippingSenderProfile,
  maskCnpj,
  maskCpf,
  type ShippingSenderProfile,
} from "../../../../lib/server/shipping-sender.ts"

type PageSearchParams = Promise<{
  status?: string | string[]
}>

export const dynamic = "force-dynamic"

function formatCep(cep: string) {
  return `${cep.slice(0, 5)}-${cep.slice(5)}`
}

function feedbackMessage(status: string | undefined) {
  switch (status) {
    case "connected":
      return "Integração conectada com sucesso."
    case "failed":
      return "Não foi possível concluir a conexão. Tente novamente."
    case "sender-saved":
      return "Remetente salvo com sucesso."
    case "sender-conflict":
      return "O remetente foi alterado em outra sessão. Recarregue a página e tente novamente."
    case "sender-invalid":
      return "Revise os dados do remetente. CPF/CNPJ, dados fiscais, endereço e CEP de origem precisam ser válidos."
    default:
      return null
  }
}

function safeSenderProfile(sender: ShippingSenderProfile | null): MelhorEnvioSenderFormProfile | null {
  if (!sender) return null
  const maskedTaxDocument =
    sender.personType === "pf"
      ? maskCpf(sender.cpf as string)
      : maskCnpj(sender.cnpj as string)

  return {
    fullName: sender.fullName,
    email: sender.email,
    phone: sender.phone,
    postalCode: sender.postalCode,
    street: sender.street,
    number: sender.number,
    complement: sender.complement,
    neighborhood: sender.neighborhood,
    city: sender.city,
    state: sender.state,
    maskedTaxDocument,
    stateRegister: sender.stateRegister,
    economicActivityCode: sender.economicActivityCode,
    version: sender.version,
  }
}

export default async function MelhorEnvioIntegrationPage({
  searchParams,
}: {
  searchParams: PageSearchParams
}) {
  await requireAdminPageAccess({ touch: true })

  const config = getMelhorEnvioOAuthEnv()
  const [credential, pfSender, pjSender] = await Promise.all([
    loadCredential(config.environment),
    getShippingSenderProfile(config.environment, "pf"),
    getShippingSenderProfile(config.environment, "pj"),
  ])

  const params = await searchParams
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status
  const message = feedbackMessage(rawStatus)
  const environmentLabel = config.environment === "production" ? "Produção" : "Sandbox"
  const connectionLabel = !credential
    ? "Não conectado"
    : credential.status === "active"
      ? "Conectado"
      : "Reautorização necessária"

  const safePfSender = safeSenderProfile(pfSender)
  const safePjSender = safeSenderProfile(pjSender)

  return (
    <AdminShell
      activeSection="integrations"
      title="Integração Melhor Envio"
      description="Gerencie a autorização e os remetentes usados nas operações de frete."
    >
      <div className="min-w-0 w-full max-w-xl space-y-6">
        {message ? (
          <p
            role="status"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          >
            {message}
          </p>
        ) : null}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ambiente</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{environmentLabel}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Conexão</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{connectionLabel}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                CEP de origem do servidor
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatCep(config.originCep)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Operação da integração
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Cotação + adicionar ao carrinho
              </p>
            </div>
          </div>

          <form method="post" action="/api/internal/melhor-envio/oauth/start" className="mt-5">
            <button
              type="submit"
              className="w-full rounded-lg border border-violet-600 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 sm:w-auto"
            >
              {credential ? "Reautorizar Melhor Envio" : "Conectar Melhor Envio"}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">Pessoa Física — CPF + DC-e</h2>
            <p className="mt-1 text-sm text-slate-600">
              Perfil PF disponível para remessas em modo declaração de conteúdo quando esse documento for aplicável. O CPF completo não é exibido novamente depois de salvo.
            </p>
            {safePfSender ? (
              <p className="mt-2 text-sm text-slate-600">
                CPF cadastrado: <strong>{safePfSender.maskedTaxDocument}</strong>
              </p>
            ) : (
              <p className="mt-2 text-sm font-medium text-amber-700">Perfil PF ainda não cadastrado.</p>
            )}
          </div>

          <MelhorEnvioSenderForm
            profile={safePfSender}
            originCep={config.originCep}
            personType="pf"
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">MEI / Pessoa Jurídica — CNPJ + NF-e</h2>
            <p className="mt-1 text-sm text-slate-600">
              Perfil PJ para remessas comerciais documentadas por NF-e. O CNPJ completo não é exibido novamente depois de salvo; a chave da NF-e pertence à remessa, não a este cadastro.
            </p>
            {safePjSender ? (
              <p className="mt-2 text-sm text-slate-600">
                CNPJ cadastrado: <strong>{safePjSender.maskedTaxDocument}</strong>
              </p>
            ) : (
              <p className="mt-2 text-sm font-medium text-amber-700">Perfil PJ ainda não cadastrado.</p>
            )}
          </div>

          <MelhorEnvioSenderForm
            profile={safePjSender}
            originCep={config.originCep}
            personType="pj"
          />
        </section>
      </div>
    </AdminShell>
  )
}
