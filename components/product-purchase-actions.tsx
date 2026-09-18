"use client"

import { useState } from "react"
import { Check, Minus, Plus, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart, type StorefrontProduct } from "@/contexts/cart-context"

export function ProductPurchaseActions({ product }: { product: StorefrontProduct }) {
  const { addToCart, items, setIsCartOpen, ensureCatalog } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [justAdded, setJustAdded] = useState(false)
  const itemInCart = items.find((item) => item.product.id === product.id)

  const addSelection = () => {
    for (let index = 0; index < quantity; index += 1) {
      addToCart(product)
    }
  }

  const handleAddToCart = () => {
    addSelection()
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1500)
  }

  const handleBuyNow = () => {
    addSelection()
    void ensureCatalog()
    setIsCartOpen(true)
  }

  return (
    <>
      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Quantidade
        </p>
        <div className="inline-flex h-11 items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setQuantity((current) => Math.max(1, current - 1))}
            className="flex h-full w-11 items-center justify-center text-slate-700 transition hover:bg-slate-50 hover:text-[#7C3AED]"
            aria-label="Diminuir quantidade"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="flex h-full min-w-12 items-center justify-center border-x border-slate-200 px-3 text-sm font-semibold text-slate-950">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((current) => Math.min(99, current + 1))}
            className="flex h-full w-11 items-center justify-center text-slate-700 transition hover:bg-slate-50 hover:text-[#7C3AED]"
            aria-label="Aumentar quantidade"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        onClick={handleAddToCart}
        className={
          "mt-5 h-14 w-full rounded-xl text-base font-semibold text-white shadow-sm transition active:scale-[0.99] " +
          (justAdded ? "bg-emerald-500 hover:bg-emerald-600" : "bg-[#8B5CF6] hover:bg-[#7C3AED]")
        }
      >
        {justAdded ? (
          <>
            <Check className="mr-2 h-5 w-5" aria-hidden="true" />
            Adicionado ao carrinho
          </>
        ) : (
          <>
            <ShoppingCart className="mr-2 h-5 w-5" aria-hidden="true" />
            Adicionar ao carrinho
          </>
        )}
      </Button>

      <Button
        type="button"
        size="lg"
        variant="outline"
        onClick={handleBuyNow}
        className="mt-2 h-14 w-full rounded-xl border-violet-300 text-base font-semibold text-[#7C3AED] hover:bg-violet-50 hover:text-[#6D28D9]"
      >
        Comprar agora
      </Button>

      {itemInCart ? (
        <p className="mt-3 text-center text-xs text-slate-500" aria-live="polite">
          {itemInCart.quantity} unidade{itemInCart.quantity === 1 ? "" : "s"} no carrinho
        </p>
      ) : null}
    </>
  )
}
