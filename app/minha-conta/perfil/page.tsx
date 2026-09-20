import type { Metadata } from "next"
import { AccountPage } from "@/components/account/account-page"
import { ProfileForm } from "@/components/account/profile-form"
import { requireCustomerPageAccess } from "@/lib/server/customer-auth"
import { getOwnCustomerProfile } from "@/lib/server/customer-profiles"

export const metadata: Metadata = {
  title: "Perfil",
}

export default async function ProfilePage() {
  await requireCustomerPageAccess("/minha-conta/perfil")
  const profile = await getOwnCustomerProfile()

  return (
    <AccountPage
      title="Perfil"
      description="Atualize seu nome e WhatsApp usados para identificação e suporte."
    >
      <div className="max-w-2xl">
        <ProfileForm
          initialName={profile?.name ?? ""}
          initialWhatsapp={profile?.whatsapp ?? ""}
        />
      </div>
    </AccountPage>
  )
}
