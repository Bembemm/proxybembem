import { AdminShell } from "../../../components/admin/admin-shell"
import { StoreSettingsForm } from "../../../components/admin/settings/store-settings-form"
import { requireAdminPageAccess } from "../../../lib/server/admin-auth.ts"
import { getAdminStoreSettings } from "../../../lib/server/store-settings.ts"
import type { StoreSettings } from "../../../lib/store-settings/store-settings.ts"

export const dynamic = "force-dynamic"

export default async function StoreSettingsPage() {
  await requireAdminPageAccess({ touch: true })

  let settings: StoreSettings
  try {
    settings = await getAdminStoreSettings()
  } catch {
    return (
      <AdminShell
        activeSection="settings"
        title="Configurações"
        description="Gerencie os dados operacionais e públicos da loja."
      >
        <div
          role="alert"
          className="w-full max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950"
        >
          <h2 className="text-base font-semibold">Configurações indisponíveis</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            Não foi possível carregar as configurações da loja. Tente novamente recarregando a página.
          </p>
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell
      activeSection="settings"
      title="Configurações"
      description="Ajuste o prazo de produção, os contatos públicos e avisos operacionais da loja."
    >
      <StoreSettingsForm settings={settings} />
    </AdminShell>
  )
}
