import { AdminShell } from "../../../../components/admin/admin-shell"
import { requireAdminPageAccess } from "../../../../lib/server/admin-auth.ts"

type PageSearchParams = Promise<{
  status?: string | string[]
}>

export const dynamic = "force-dynamic"

export default async function MelhorEnvioIntegrationPage({
  searchParams,
}: {
  searchParams: PageSearchParams
}) {
  await requireAdminPageAccess({ touch: true })

  const params = await searchParams
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status
  const message =
    rawStatus === "connected"
      ? "Integração conectada com sucesso."
      : rawStatus === "failed"
        ? "Não foi possível concluir a conexão. Tente novamente."
        : null

  return (
    <AdminShell
      activeSection="integrations"
      title="Integração Melhor Envio"
      description="Autorize a conta do Melhor Envio usada no cálculo de frete da loja."
    >
      <div className="min-w-0 w-full max-w-xl space-y-5">
        {message ? (
          <p
            role="status"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          >
            {message}
          </p>
        ) : null}

        <form method="post" action="/api/internal/melhor-envio/oauth/start">
          <button
            type="submit"
            className="w-full rounded-lg border border-violet-600 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 sm:w-auto"
          >
            Conectar Melhor Envio
          </button>
        </form>
      </div>
    </AdminShell>
  )
}
