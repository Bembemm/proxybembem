"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, ShoppingBag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CartItems } from "@/components/cart-items"
import { CheckoutForm } from "@/components/checkout-form"
import { OrderSummary } from "@/components/order-summary"
import { useCart } from "@/contexts/cart-context"
import {
  buildWhatsAppOrderMessage,
  buildWhatsAppOrderUrl,
  validateCheckout,
  type CheckoutData,
  type CheckoutErrors,
} from "@/lib/checkout"

const EMPTY_CHECKOUT: CheckoutData = {
  nome: "",
  cep: "",
}

export function CartPanel() {
  const {
    items,
    removeFromCart,
    updateQuantity,
    totalPrice,
    isCartOpen,
    setIsCartOpen,
    clearCart,
  } = useCart()

  const [checkout, setCheckout] = useState<CheckoutData>(EMPTY_CHECKOUT)
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [whatsappOpened, setWhatsappOpened] = useState(false)
  const [popupBlocked, setPopupBlocked] = useState(false)

  useEffect(() => {
    if (!isCartOpen) return

    document.body.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCartOpen(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isCartOpen, setIsCartOpen])

  const handleCheckoutChange = (field: keyof CheckoutData, value: string) => {
    setCheckout((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setPopupBlocked(false)
  }

  const handleOpenWhatsApp = () => {
    if (items.length === 0) return

    const nextErrors = validateCheckout(checkout)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) return

    const message = buildWhatsAppOrderMessage(items, totalPrice, checkout)
    const whatsappWindow = window.open(buildWhatsAppOrderUrl(message), "_blank")

    if (!whatsappWindow) {
      setPopupBlocked(true)
      return
    }

    try {
      whatsappWindow.opener = null
    } catch {
      // Some browsers prevent access to the newly opened window. The order can still continue.
    }

    setPopupBlocked(false)
    setWhatsappOpened(true)
  }

  const handleConfirmSent = () => {
    clearCart()
    setCheckout(EMPTY_CHECKOUT)
    setErrors({})
    setWhatsappOpened(false)
    setPopupBlocked(false)
    setIsCartOpen(false)
  }

  const handleClose = () => {
    setIsCartOpen(false)
  }

  if (!isCartOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 hidden md:block"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div
        className="fixed inset-0 md:inset-auto md:right-0 md:top-0 md:h-full md:w-[450px] bg-slate-900 md:border-l md:border-[#8B5CF6]/30 shadow-2xl z-50 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-panel-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-[#8B5CF6]/20 bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors md:hidden"
              type="button"
              aria-label="Voltar e fechar carrinho"
            >
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-[#8B5CF6]" />
              <h2 id="cart-panel-title" className="text-xl font-semibold text-white">
                Meu Carrinho
              </h2>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors hidden md:block"
            type="button"
            aria-label="Fechar carrinho"
          >
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <ShoppingBag className="w-20 h-20 text-slate-600 mb-4" />
              <p className="text-slate-400 text-xl">Seu carrinho está vazio</p>
              <p className="text-slate-500 text-base mt-2">Adicione produtos para continuar</p>
              <Button
                onClick={handleClose}
                className="mt-6 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-8 py-3 text-base"
                type="button"
              >
                Continuar Comprando
              </Button>
            </div>
          ) : (
            <div className="p-4 space-y-5">
              <CartItems
                items={items}
                onUpdateQuantity={updateQuantity}
                onRemove={removeFromCart}
              />

              <CheckoutForm data={checkout} errors={errors} onChange={handleCheckoutChange} />

              <OrderSummary
                totalPrice={totalPrice}
                whatsappOpened={whatsappOpened}
                popupBlocked={popupBlocked}
                onOpenWhatsApp={handleOpenWhatsApp}
                onConfirmSent={handleConfirmSent}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
