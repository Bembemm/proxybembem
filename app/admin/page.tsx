import { requireAdminPageAccess } from "../../lib/server/admin-auth.ts"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  await requireAdminPageAccess({ touch: true })

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">Administração</h1>

      <nav className="flex flex-col gap-3">
        <a href="/admin/integrations/melhor-envio" className="underline">
          Integração Melhor Envio
        </a>
      </nav>

      <form method="post" action="/api/admin/logout">
        <button type="submit" className="rounded-md border px-4 py-2 text-sm font-medium">
          Sair
        </button>
      </form>
    </main>
  )
}
