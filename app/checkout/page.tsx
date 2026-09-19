import { CheckoutPage } from "@/components/checkout-page"
import type { CheckoutSavedAddress } from "@/lib/checkout"
import { listOwnCustomerAddresses } from "@/lib/server/customer-addresses"
import { requireCustomerPageAccess } from "@/lib/server/customer-auth"
import { getOwnCustomerProfile } from "@/lib/server/customer-profiles"

export default async function Page() {
  const identity = await requireCustomerPageAccess("/checkout")

  let savedAddresses: CheckoutSavedAddress[] = []
  let profile: Awaited<ReturnType<typeof getOwnCustomerProfile>> = null

  try {
    const [addresses, customerProfile] = await Promise.all([
      listOwnCustomerAddresses(),
      getOwnCustomerProfile(),
    ])

    savedAddresses = addresses.map((address) => ({
      id: address.id,
      label: address.label,
      cep: address.cep,
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      isDefault: address.isDefault,
    }))
    profile = customerProfile
  } catch {
    // Saved profile/address data is only a convenience. Authenticated checkout
    // remains available if those optional reads fail.
  }

  return (
    <CheckoutPage
      savedAddresses={savedAddresses}
      customerPrefill={{
        name: profile?.name ?? "",
        email: identity.email,
        whatsapp: profile?.whatsapp ?? "",
      }}
    />
  )
}
