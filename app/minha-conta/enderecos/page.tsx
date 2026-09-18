import type { Metadata } from "next"

import {
  AddressBook,
  type AddressBookAddress,
} from "@/components/account/address-book"
import { AccountPage } from "@/components/account/account-page"
import { listOwnCustomerAddresses } from "@/lib/server/customer-addresses"
import { requireCustomerPageAccess } from "@/lib/server/customer-auth"

export const metadata: Metadata = {
  title: "Endereços",
}

export default async function AddressesPage() {
  await requireCustomerPageAccess("/minha-conta/enderecos")
  const addresses = await listOwnCustomerAddresses()
  const safeAddresses: AddressBookAddress[] = addresses.map((address) => ({
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

  return (
    <AccountPage
      title="Endereços"
      description="Gerencie endereços para preencher suas próximas compras com mais rapidez."
    >
      <AddressBook initialAddresses={safeAddresses} />
    </AccountPage>
  )
}
