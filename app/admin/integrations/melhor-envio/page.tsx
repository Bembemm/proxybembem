import { AdminShell } from "../../../../components/admin/admin-shell"
import {
  MelhorEnvioSenderForm,
  type MelhorEnvioSenderFormProfile,
} from "../../../../components/admin/melhor-envio-sender-form"
import { requireAdminPageAccess } from "../../../../lib/server/admin-auth.ts"
import { getMelhorEnvioShipmentEnv } from "../../../../lib/server/env.ts"
import { loadCredential } from "../../../../lib/server/melhor-envio-oauth-repository.ts"
import {
  getShippingSenderProfile,
  maskCpf,
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
      return "Revise os dados do remetente. O CPF, endereço e CEP de origem precisam ser válidos."
    default:
      return null
  }
}

export default async function MelhorEnvioIntegrationPage({
  searchParams,
}: {
  searchParams: PageSearchParams
}) {
  await requireAdminPageAccess({ touch: true })

  const config = getMelhorEnvioShipmentEnv()
  const [credential, sender] = await Promise.all([
    loadCredential(config.environment),
    getShippingSenderProfile(config.environment),
  ])

  const params = await searchParams
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status
  const message = feedbackMessage(rawStatus)
  const environmentLabel =
    config.environment === "production" ? "Produção" : "Sandbox"
  const connectionLabel = !credential
    ? "Não conectado"
    : credential.status === "active"
      ? "Conectado"
      : "Reautorização necessária"

  const safeSenderProfile: MelhorEnvioSenderFormProfile | null = sender
    ? {
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
        maskedCpf: maskCpf(sender.cpf),
        version: sender.version,
      }
    : null

  return (
    <AdminShell
      activeSection="integrations"
      title="Integração Melhor Envio"
      description="Gerencie a autorização e o remetente usados nas operações de frete."
    >
      <div className="min-w-0 w-full max-w-3xl space-y-6">
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ambiente
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {environmentLabel}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Conexão
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {connectionLabel}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                CEP de origem do servidor
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatCep(config.originCep)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Compra de etiqueta
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {config.labelPurchaseEnabled ? "Habilitada" : "Desabilitada"}
              </p>
            </div>
          </div>

          <form
            method="post"
            action="/api/internal/melhor-envio/oauth/start"
            className="mt-5"
          >
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
            <h2 className="text-base font-semibold text-slate-900">Remetente</h2>
            <p className="mt-1 text-sm text-slate-600">
              Perfil PF usado na preparação das remessas. O CPF completo não é
              exibido novamente depois de salvo.
            </p>
            {safeSenderProfile ? (
              <p className="mt-2 text-sm text-slate-600">
                CPF cadastrado: <strong>{safeSenderProfile.maskedCpf}</strong>
              </p>
            ) : (
              <p className="mt-2 text-sm font-medium text-amber-700">
                Cadastre o remetente antes de preparar uma remessa.
              </p>
            )}
          </div>

          <MelhorEnvioSenderForm
            profile={safeSenderProfile}
            originCep={config.originCep}
          />
        </section>
      </div>
    </AdminShell>
  )
}
