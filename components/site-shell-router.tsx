"use client"

import { usePathname } from "next/navigation"
import { LazyCartPanel } from "@/components/lazy-cart-panel"
import { CartProvider } from "@/contexts/cart-context"

export function SiteShellRouter({
  children,
  storefrontBefore,
  storefrontAfter,
}: Readonly<{
  children: React.ReactNode
  storefrontBefore: React.ReactNode
  storefrontAfter: React.ReactNode
}>) {
  const pathname = usePathname()
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/")
  const isCheckoutRoute = pathname === "/checkout"

  if (isAdminRoute) return <>{children}</>

  if (isCheckoutRoute) {
    return <CartProvider>{children}</CartProvider>
  }

  return (
    <CartProvider>
      <main className="relative min-h-screen w-full overflow-x-hidden">
        {storefrontBefore}
        {children}
        {storefrontAfter}
        <LazyCartPanel />
      </main>
    </CartProvider>
  )
}
