import { AccountShell } from "@/components/account/account-shell"
import { requireCustomerPageAccess } from "@/lib/server/customer-auth"

export const dynamic = "force-dynamic"

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireCustomerPageAccess()
  return <AccountShell>{children}</AccountShell>
}
