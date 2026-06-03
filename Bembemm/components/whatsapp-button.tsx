"use client"

import { ShoppingCart } from "lucide-react"
import { useCart } from "@/contexts/cart-context"

export function CartFloatingButton() {
  const { totalItems, setIsCartOpen } = useCart()

  return (
    <button
      onClick={() => setIsCartOpen(true)}
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 w-12 h-12 sm:w-14 sm:h-14 bg-[#8B5CF6]/90 hover:bg-[#8B5CF6] text-white border-2 border-[#8B5CF6]/50 flex items-center justify-center rounded-full shadow-lg shadow-[#8B5CF6]/20 hover:shadow-xl hover:shadow-[#8B5CF6]/30 transition-all hover:scale-110 active:scale-95"
      aria-label="Abrir carrinho"
    >
      <ShoppingCart className="w-6 h-6 sm:w-7 sm:h-7" />
      {totalItems > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 bg-red-500 text-white text-[10px] sm:text-xs font-bold rounded-full flex items-center justify-center">
          {totalItems > 99 ? "99+" : totalItems}
        </span>
      )}
    </button>
  )
}
