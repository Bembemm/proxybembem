"use client"

import { useState } from "react"
import { Check, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart, type StorefrontProduct } from "@/contexts/cart-context"

export function AddToCartButton({ product }: { product: StorefrontProduct }) {
  const { addToCart, items } = useCart()
  const [justAdded, setJustAdded] = useState(false)
  const itemInCart = items.find((item) => item.product.id === product.id)

  const handleAddToCart = () => {
    addToCart(product)
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1500)
  }

  return (
    <Button
      onClick={handleAddToCart}
      size="sm"
      type="button"
      className={
        "h-11 w-full text-sm tracking-wide transition-all duration-300 active:scale-[0.98] sm:text-base " +
        (justAdded
          ? "border-green-500 bg-green-500 text-white hover:bg-green-600"
          : "border border-[#8B5CF6] bg-transparent text-[#8B5CF6] hover:border-[#8B5CF6] hover:bg-[#8B5CF6] hover:text-white")
      }
    >
      {justAdded ? (
        <>
          <Check className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
          Adicionado!
        </>
      ) : (
        <>
          <ShoppingCart className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
          {itemInCart ? "No Carrinho (" + itemInCart.quantity + ")" : "Adicionar"}
        </>
      )}
    </Button>
  )
}
