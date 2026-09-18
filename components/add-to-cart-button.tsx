"use client"

import { useState } from "react"
import { Check, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart, type StorefrontProduct } from "@/contexts/cart-context"

export function AddToCartButton({
  product,
  label = "Adicionar",
  variant = "outline",
}: {
  product: StorefrontProduct
  label?: string
  variant?: "outline" | "solid"
}) {
  const { addToCart, items } = useCart()
  const [justAdded, setJustAdded] = useState(false)
  const itemInCart = items.find((item) => item.product.id === product.id)

  const handleAddToCart = () => {
    addToCart(product)
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1500)
  }

  const idleClasses =
    variant === "solid"
      ? "border border-[#7C3AED] bg-gradient-to-r from-[#7C3AED] to-[#9333EA] text-white shadow-sm hover:border-[#6D28D9] hover:from-[#6D28D9] hover:to-[#7E22CE]"
      : "border border-[#8B5CF6] bg-transparent text-[#8B5CF6] hover:border-[#8B5CF6] hover:bg-[#8B5CF6] hover:text-white"

  return (
    <Button
      onClick={handleAddToCart}
      size="sm"
      type="button"
      className={
        "h-[44px] w-full rounded-[10px] px-2 text-[13px] font-medium tracking-normal transition-all duration-300 active:scale-[0.98] sm:h-11 sm:px-3 sm:text-base " +
        (justAdded
          ? "border-green-500 bg-green-500 text-white hover:bg-green-600"
          : idleClasses)
      }
    >
      {justAdded ? (
        <>
          <Check className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
          Adicionado!
        </>
      ) : (
        <>
          <ShoppingCart className="mr-0.5 h-4 w-4 sm:mr-1 sm:h-4 sm:w-4" aria-hidden="true" />
          {itemInCart ? "No Carrinho (" + itemInCart.quantity + ")" : label}
        </>
      )}
    </Button>
  )
}
