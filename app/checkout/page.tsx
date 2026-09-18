import { CheckoutPage } from "@/components/checkout-page"
import type { CheckoutSavedAddress } from "@/lib/checkout"
import { listOwnCustomerAddresses } from "@/lib/server/customer-addresses"
import { getOptionalCustomerIdentity } from "@/lib/server/customer-auth"

export default async function Page() {
  const identity = await getOptionalCustomerIdentity()
  let savedAddresses: CheckoutSavedAddress[] = []

  if (identity) {
    try {
      const addresses = await listOwnCustomerAddresses()
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
    } catch {
      // Saved addresses are a checkout convenience. Checkout must stay available
      // if the address book cannot be loaded.
      savedAddresses = []
    }
  }

  return <CheckoutPage savedAddresses={savedAddresses} />
}
