"use client"

import { useState } from "react"
import { Check, ShoppingCart, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useCart, type Product } from "@/contexts/cart-context"

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

interface ProductDetailModalProps {
  product: Product
  isOpen: boolean
  onClose: () => void
}

export function ProductDetailModal({ product, isOpen, onClose }: ProductDetailModalProps) {
  const { addToCart, items } = useCart()
  const [justAdded, setJustAdded] = useState(false)

  const itemInCart = items.find((item) => item.product.id === product.id)

  const handleAddToCart = () => {
    addToCart(product)
    setJustAdded(true)
    window.setTimeout(() => {
      setJustAdded(false)
      onClose()
    }, 800)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] p-0 bg-slate-900/95 backdrop-blur-xl border border-[#8B5CF6]/30 overflow-hidden rounded-xl">
        <DialogTitle className="sr-only">{product.title}</DialogTitle>

        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-50 p-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 transition-colors active:scale-95"
          type="button"
          aria-label="Fechar detalhes do produto"
        >
          <X className="w-5 h-5 text-slate-300" />
        </button>

        <div className="p-5 md:p-6 flex flex-col">
          {product.tag && (
            <span className="self-start bg-[#8B5CF6] text-white text-sm font-semibold px-3 py-1 tracking-wider uppercase rounded mb-3">
              {product.tag}
            </span>
          )}

          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 pr-10">
            {product.title}
          </h2>

          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-base text-slate-400 line-through">
              {formatPrice(product.originalPrice)}
            </span>
            <span className="text-3xl font-bold text-white">
              {formatPrice(product.discountPrice)}
            </span>
          </div>

          <p className="text-base text-gray-300 leading-relaxed mb-5">{product.description}</p>

          <div className="flex-1 mb-5 overflow-y-auto max-h-[320px] pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
            <div className="leading-relaxed space-y-4">
              {product.notice && (
                <p className="text-xl font-bold text-yellow-500 text-center">{product.notice}</p>
              )}

              <div className="space-y-2">
                {product.details.map((detail) => (
                  <p key={detail.label}>
                    <span className="font-bold text-white">{detail.label}:</span>{" "}
                    <span className="text-base text-gray-300">{detail.value}</span>
                  </p>
                ))}
              </div>

              {product.sections.map((section) => (
                <section key={section.title} className="space-y-1">
                  <h3 className="font-bold text-white text-lg">{section.title}</h3>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-base text-gray-300">
                      {paragraph}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </div>

          {itemInCart && (
            <p className="text-base text-gray-300 mb-3" aria-live="polite">
              Você já tem {itemInCart.quantity} unidade{itemInCart.quantity > 1 ? "s" : ""} no carrinho
            </p>
          )}

          <Button
            onClick={handleAddToCart}
            size="lg"
            type="button"
            className={`w-full h-14 text-lg font-semibold tracking-wide transition-all duration-300 active:scale-[0.98] rounded-xl ${
              justAdded
                ? "bg-green-500 hover:bg-green-600 text-white"
                : "bg-[#8B5CF6] hover:bg-[#7C3AED] text-white"
            }`}
          >
            {justAdded ? (
              <>
                <Check className="w-5 h-5 mr-2" />
                Adicionado ao Carrinho!
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5 mr-2" />
                Adicionar ao Carrinho
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
