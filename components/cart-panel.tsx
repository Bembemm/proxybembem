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
  whatsapp: "",
  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
}

interface CheckoutResponse {
  checkoutUrl?: unknown
  error?: unknown
  fieldErrors?: CheckoutErrors
}

export function CartPanel() {
  const {
    items,
    removeFromCart,
    updateQuantity,
    totalPrice,
    isCartOpen,
    setIsCartOpen,
  } = useCart()

  const [checkout, setCheckout] = useState<CheckoutData>(EMPTY_CHECKOUT)
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  useEffect(() => {
    if (!isCartOpen) return

    document.body.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        setIsCartOpen(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isCartOpen, isSubmitting, setIsCartOpen])

  const handleCheckoutChange = (field: keyof CheckoutData, value: string) => {
    setCheckout((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setCheckoutError(null)
  }

  const handleCheckout = async () => {
    if (items.length === 0 || isSubmitting) return

    const nextErrors = validateCheckout(checkout)
    setErrors(nextErrors)
    setCheckoutError(null)

    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
          customer: checkout,
        }),
      })

      const result = (await response.json().catch(() => null)) as CheckoutResponse | null

      if (!response.ok) {
        if (result?.fieldErrors) setErrors(result.fieldErrors)
        setCheckoutError(
          typeof result?.error === "string"
            ? result.error
            : "Não foi possível iniciar o pagamento. Tente novamente.",
        )
        return
      }

      if (typeof result?.checkoutUrl !== "string") {
        throw new Error("Checkout URL missing")
      }

      const checkoutUrl = new URL(result.checkoutUrl)
      if (checkoutUrl.protocol !== "https:") {
        throw new Error("Checkout URL must use HTTPS")
      }

      window.location.assign(checkoutUrl.toString())
    } catch {
      setCheckoutError(
        "Não foi possível iniciar o pagamento. Tente novamente ou continue pelo WhatsApp.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) setIsCartOpen(false)
  }

  const whatsappFallbackUrl = buildWhatsAppOrderUrl(
    buildWhatsAppOrderMessage(items, totalPrice, checkout),
  )

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
        aria-busy={isSubmitting}
      >
        <div className="flex items-center justify-between p-4 border-b border-[#8B5CF6]/20 bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors md:hidden disabled:opacity-50"
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
            disabled={isSubmitting}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors hidden md:block disabled:opacity-50"
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
                isSubmitting={isSubmitting}
                checkoutError={checkoutError}
                whatsappFallbackUrl={whatsappFallbackUrl}
                onCheckout={handleCheckout}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
