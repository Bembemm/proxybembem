"use client"

import { ShoppingCart } from "lucide-react"
import { useCart } from "@/contexts/cart-context"

export function CartFloatingButton() {
  const { totalItems, setIsCartOpen, isCartOpen } = useCart()

  // Não mostrar o botão quando o carrinho está aberto
  if (isCartOpen) return null

  return (
    <button
      onClick={() => setIsCartOpen(true)}
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 w-14 h-14 sm:w-16 sm:h-16 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white flex items-center justify-center rounded-full shadow-xl shadow-[#8B5CF6]/30 hover:shadow-2xl hover:shadow-[#8B5CF6]/40 transition-all hover:scale-105 active:scale-95"
      aria-label="Abrir carrinho"
      type="button"
    >
      <ShoppingCart className="w-7 h-7 sm:w-8 sm:h-8" />
      {totalItems > 0 && (
        <span className="absolute -top-1 -right-1 w-6 h-6 sm:w-7 sm:h-7 bg-red-500 text-white text-sm font-bold rounded-full flex items-center justify-center border-2 border-white">
          {totalItems > 99 ? "99+" : totalItems}
        </span>
      )}
    </button>
  )
}
