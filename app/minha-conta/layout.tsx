import { AccountShell } from "@/components/account/account-shell"

export const dynamic = "force-dynamic"

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>
}
