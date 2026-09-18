"use client"

import dynamic from "next/dynamic"
import { useCart } from "@/contexts/cart-context"

const CartPanel = dynamic(
  () => import("@/components/cart-panel").then((module) => module.CartPanel),
  {
    ssr: false,
    loading: () => null,
  },
)

export function LazyCartPanel() {
  const { isCartOpen } = useCart()

  return isCartOpen ? <CartPanel /> : null
}
