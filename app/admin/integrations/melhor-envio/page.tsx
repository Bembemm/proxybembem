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
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Integração Melhor Envio</h1>
        <p className="text-sm text-muted-foreground">
          Área administrativa para autorizar a conta do Melhor Envio usada no cálculo de frete.
        </p>
      </div>

      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}

      <form method="post" action="/api/internal/melhor-envio/oauth/start">
        <button type="submit" className="rounded-md border px-4 py-2 text-sm font-medium">
          Conectar Melhor Envio
        </button>
      </form>
    </main>
  )
}
