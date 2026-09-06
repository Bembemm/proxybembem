"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { ArrowLeft, ShoppingBag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CartItems } from "@/components/cart-items"
import { CheckoutForm } from "@/components/checkout-form"
import { OrderSummary } from "@/components/order-summary"
import { ShippingOptions } from "@/components/shipping-options"
import { useCart } from "@/contexts/cart-context"
import {
  buildWhatsAppOrderMessage,
  buildWhatsAppOrderUrl,
  digitsOnly,
  validateCheckout,
  type CheckoutData,
  type CheckoutErrors,
} from "@/lib/checkout"
import {
  clearCheckoutLoginDraft,
  readCheckoutLoginDraft,
  saveCheckoutLoginDraft,
} from "@/lib/checkout-login-draft"
import {
  applyShippingChanged,
  invalidateCheckoutSelection,
  selectShippingOption,
  type ShippingClientState,
} from "@/lib/shipping-client"
import { isAllowedMercadoPagoCheckoutUrl } from "@/lib/server/checkout-url"
import type { PublicShippingOption } from "@/lib/server/shipping-quote"

const EMPTY_CHECKOUT: CheckoutData = {
  nome: "",
  email: "",
  whatsapp: "",
  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
}

const EMPTY_SHIPPING: ShippingClientState = {
  shippingOptions: [],
  selectedShipping: null,
  shippingError: null,
  checkoutAttemptId: null,
}

interface CheckoutResponse {
  checkoutUrl?: unknown
  error?: unknown
  code?: unknown
  fieldErrors?: CheckoutErrors
  options?: unknown
}

interface ShippingQuoteResponse {
  options?: unknown
  error?: unknown
}

function parseShippingOptions(value: unknown): PublicShippingOption[] | null {
  if (!Array.isArray(value)) return null

  const options: PublicShippingOption[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null
    const candidate = entry as Partial<PublicShippingOption>
    if (
      typeof candidate.serviceId !== "string" ||
      !candidate.serviceId ||
      typeof candidate.serviceName !== "string" ||
      !candidate.serviceName ||
      typeof candidate.carrierName !== "string" ||
      !candidate.carrierName ||
      !Number.isSafeInteger(candidate.priceCents) ||
      (candidate.priceCents ?? 0) <= 0 ||
      !Number.isSafeInteger(candidate.deliveryDays) ||
      (candidate.deliveryDays ?? -1) < 0 ||
      typeof candidate.quoteToken !== "string" ||
      !candidate.quoteToken
    ) {
      return null
    }

    options.push(candidate as PublicShippingOption)
  }

  return options
}

export function CartPanel() {
  const pathname = usePathname()
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
  const [shipping, setShipping] = useState<ShippingClientState>(EMPTY_SHIPPING)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const restoredShippingServiceIdRef = useRef<string | null>(null)

  const destinationCep = digitsOnly(checkout.cep)
  const hasValidCep = /^\d{8}$/.test(destinationCep)
  const cartQuoteKey = useMemo(
    () =>
      items
        .map((item) => `${item.product.id}:${item.quantity}`)
        .sort()
        .join("|"),
    [items],
  )

  useEffect(() => {
    if (pathname !== "/produtos") return

    const draft = readCheckoutLoginDraft(window.sessionStorage)
    if (!draft) return

    restoredShippingServiceIdRef.current = draft.shippingServiceId
    setCheckout(draft.checkout)
    setIsCartOpen(true)
  }, [pathname, setIsCartOpen])

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

  useEffect(() => {
    if (!isCartOpen) return

    setShipping((current) => invalidateCheckoutSelection(current))
    setCheckoutError(null)

    if (!hasValidCep || items.length === 0) {
      setIsQuoting(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setIsQuoting(true)

      try {
        const response = await fetch("/api/shipping/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
            })),
            destinationCep,
          }),
          signal: controller.signal,
        })

        const result = (await response.json().catch(() => null)) as ShippingQuoteResponse | null
        if (!response.ok) {
          throw new Error(
            typeof result?.error === "string"
              ? result.error
              : "Não foi possível calcular o frete. Tente novamente.",
          )
        }

        const options = parseShippingOptions(result?.options)
        if (!options || options.length === 0) {
          throw new Error("Nenhuma opção de frete disponível para este CEP.")
        }

        const restoredShippingServiceId = restoredShippingServiceIdRef.current
        const restoredShipping = restoredShippingServiceId
          ? options.find((option) => option.serviceId === restoredShippingServiceId) ?? null
          : null
        restoredShippingServiceIdRef.current = null

        setShipping((current) => ({
          ...current,
          shippingOptions: options,
          selectedShipping: restoredShipping,
          shippingError: null,
          checkoutAttemptId: null,
        }))
      } catch (error) {
        if (controller.signal.aborted) return
        setShipping((current) => ({
          ...current,
          shippingOptions: [],
          selectedShipping: null,
          shippingError:
            error instanceof Error
              ? error.message
              : "Não foi possível calcular o frete. Tente novamente.",
          checkoutAttemptId: null,
        }))
      } finally {
        if (!controller.signal.aborted) setIsQuoting(false)
      }
    }, 400)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [cartQuoteKey, destinationCep, hasValidCep, isCartOpen, items])

  const handleCheckoutChange = (field: keyof CheckoutData, value: string) => {
    setCheckout((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setCheckoutError(null)

    if (field === "cep") restoredShippingServiceIdRef.current = null

    setShipping((current) =>
      field === "cep"
        ? invalidateCheckoutSelection(current)
        : { ...current, checkoutAttemptId: null },
    )
  }

  const handleShippingSelect = (option: PublicShippingOption) => {
    restoredShippingServiceIdRef.current = null
    setShipping((current) => selectShippingOption(current, option))
    setCheckoutError(null)
  }

  const handleCheckout = async () => {
    if (items.length === 0 || isSubmitting || isQuoting) return

    const nextErrors = validateCheckout(checkout)
    setErrors(nextErrors)
    setCheckoutError(null)

    if (Object.keys(nextErrors).length > 0) return
    if (!shipping.selectedShipping) {
      setShipping((current) => ({
        ...current,
        shippingError: "Escolha uma opção de frete antes de continuar.",
      }))
      return
    }

    const attemptId = shipping.checkoutAttemptId ?? crypto.randomUUID()
    setShipping((current) => ({ ...current, checkoutAttemptId: attemptId }))
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
          selectedQuoteToken: shipping.selectedShipping.quoteToken,
          checkoutAttemptId: attemptId,
        }),
      })

      const result = (await response.json().catch(() => null)) as CheckoutResponse | null

      if (!response.ok) {
        if (result?.code === "authentication_required") {
          saveCheckoutLoginDraft(
            window.sessionStorage,
            checkout,
            shipping.selectedShipping.serviceId,
          )
          setIsCartOpen(false)
          window.location.assign("/entrar?next=%2Fprodutos")
          return
        }

        if (result?.fieldErrors) setErrors(result.fieldErrors)

        if (result?.code === "shipping_changed") {
          const options = parseShippingOptions(result.options)
          if (options) {
            setShipping((current) => applyShippingChanged(current, options))
          } else {
            setShipping((current) => invalidateCheckoutSelection(current))
          }
        } else if (result?.code === "checkout_attempt_conflict") {
          setShipping((current) => ({ ...current, checkoutAttemptId: null }))
        }

        setCheckoutError(
          typeof result?.error === "string"
            ? result.error
            : "Não foi possível iniciar o pagamento. Tente novamente.",
        )
        return
      }

      if (
        typeof result?.checkoutUrl !== "string" ||
        !isAllowedMercadoPagoCheckoutUrl(result.checkoutUrl)
      ) {
        throw new Error("Unsafe checkout URL")
      }

      clearCheckoutLoginDraft(window.sessionStorage)
      window.location.assign(result.checkoutUrl)
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
    buildWhatsAppOrderMessage(items, totalPrice, checkout, shipping.selectedShipping),
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
        aria-busy={isSubmitting || isQuoting}
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

              <ShippingOptions
                options={shipping.shippingOptions}
                selected={shipping.selectedShipping}
                isLoading={isQuoting}
                error={shipping.shippingError}
                hasValidCep={hasValidCep}
                onSelect={handleShippingSelect}
              />

              <OrderSummary
                totalPrice={totalPrice}
                selectedShipping={shipping.selectedShipping}
                isQuoting={isQuoting}
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
