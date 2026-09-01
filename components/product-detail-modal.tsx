"use client"

import { useState } from "react"
import { Check, Info, ShoppingCart, X } from "lucide-react"
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
      <DialogContent className="max-w-lg w-[95vw] max-h-[92vh] p-0 bg-slate-900/95 backdrop-blur-xl border border-[#8B5CF6]/30 overflow-hidden rounded-2xl shadow-2xl">
        <DialogTitle className="sr-only">{product.title}</DialogTitle>

        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-50 p-2.5 rounded-full bg-slate-800/90 hover:bg-slate-700 transition-colors active:scale-95"
          type="button"
          aria-label="Fechar detalhes do produto"
        >
          <X className="w-5 h-5 text-slate-300" />
        </button>

        <div className="p-5 md:p-6 flex flex-col min-h-0">
          {product.tag && (
            <span className="self-start bg-[#8B5CF6] text-white text-xs font-semibold px-3 py-1.5 tracking-wider uppercase rounded-full mb-3">
              {product.tag}
            </span>
          )}

          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 pr-10 leading-tight">
            {product.title}
          </h2>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
            <span className="text-sm md:text-base text-slate-400 line-through">
              {formatPrice(product.originalPrice)}
            </span>
            <span className="text-3xl font-bold text-white">
              {formatPrice(product.discountPrice)}
            </span>
          </div>

          {product.highlights && product.highlights.length > 0 && (
            <div className="mb-4" aria-label="Informações rápidas">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">
                Informações rápidas
              </p>
              <div className="flex flex-wrap gap-2">
                {product.highlights?.map((highlight) => (
                  <span
                    key={highlight}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-2.5 py-1.5 text-xs md:text-sm text-violet-100"
                  >
                    <Check className="w-3.5 h-3.5 text-[#A78BFA]" />
                    {highlight}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-sm md:text-base text-gray-300 leading-relaxed mb-4 rounded-xl border border-slate-700/70 bg-slate-800/45 p-3.5">
            {product.description}
          </p>

          <div className="flex-1 min-h-0 mb-5 overflow-y-auto max-h-[330px] pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
            <div className="leading-relaxed space-y-3">
              {product.notice && (
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 border-b border-slate-700/70 pb-2">
                  <Info className="w-4 h-4 text-[#A78BFA] shrink-0" />
                  <span>{product.notice}</span>
                </div>
              )}

              <div className="space-y-2.5">
                {product.details.map((detail) => (
                  <div
                    key={detail.label}
                    className="rounded-xl border border-slate-700/60 bg-slate-800/35 p-3"
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-[#A78BFA] mb-1">
                      {detail.label}
                    </p>
                    <p className="text-sm md:text-base text-gray-300">{detail.value}</p>
                  </div>
                ))}
              </div>

              {product.sections.map((section) => (
                <section
                  key={section.title}
                  className="rounded-xl border border-slate-700/60 bg-slate-800/35 p-3 space-y-1"
                >
                  <h3 className="font-bold text-white text-sm uppercase tracking-wide">
                    {section.title}
                  </h3>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-sm md:text-base text-gray-300">
                      {paragraph}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </div>

          {itemInCart && (
            <p className="text-sm text-gray-300 mb-3" aria-live="polite">
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
