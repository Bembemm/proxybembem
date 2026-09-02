import type { Metadata } from "next"
import { ProfileForm } from "@/components/account/profile-form"
import { requireCustomerPageAccess } from "@/lib/server/customer-auth"
import { getOwnCustomerProfile } from "@/lib/server/customer-profiles"

export const metadata: Metadata = {
  title: "Perfil",
}

export default async function ProfilePage() {
  await requireCustomerPageAccess()
  const profile = await getOwnCustomerProfile()

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Perfil</h1>
        <p className="text-sm text-slate-600">Atualize seu nome e WhatsApp usados para suporte.</p>
      </div>
      <ProfileForm
        initialName={profile?.name ?? ""}
        initialWhatsapp={profile?.whatsapp ?? ""}
      />
    </div>
  )
}
