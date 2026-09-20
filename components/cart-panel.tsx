"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2, ShoppingBag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CartItems } from "@/components/cart-items"
import { useCart } from "@/contexts/cart-context"
import { digitsOnly, formatCep, formatPrice } from "@/lib/checkout"
import {
  invalidateCheckoutSelection,
  parsePublicShippingOptions,
  selectShippingOption,
  type ShippingClientState,
} from "@/lib/shipping-client"
import type { PublicShippingOption } from "@/lib/server/shipping-quote"

const ShippingOptions = dynamic(
  () => import("@/components/shipping-options").then((module) => module.ShippingOptions),
  { ssr: false, loading: () => null },
)

const CHECKOUT_PREVIEW_KEY = "proxybembem-checkout-preview-v2"

const EMPTY_SHIPPING: ShippingClientState = {
  shippingOptions: [],
  selectedShipping: null,
  shippingError: null,
  checkoutAttemptId: null,
}

interface ShippingQuoteResponse {
  options?: unknown
  error?: unknown
}

export function CartPanel() {
  const {
    items,
    removeFromCart,
    updateQuantity,
    totalPrice,
    isCartOpen,
    setIsCartOpen,
    catalogStatus,
    retryCatalog,
    cartNotice,
    dismissCartNotice,
    ensureCatalog,
  } = useCart()

  const [cep, setCep] = useState("")
  const [shipping, setShipping] = useState<ShippingClientState>(EMPTY_SHIPPING)
  const [isQuoting, setIsQuoting] = useState(false)

  const destinationCep = digitsOnly(cep)
  const hasValidCep = /^\d{8}$/.test(destinationCep)
  const cartQuoteKey = useMemo(
    () =>
      items
        .map((item) => `${item.product.id}:${item.quantity}`)
        .sort()
        .join("|"),
    [items],
  )
  const shippingPrice = shipping.selectedShipping
    ? shipping.selectedShipping.priceCents / 100
    : 0
  const finalTotal = totalPrice + shippingPrice

  useEffect(() => {
    if (isCartOpen) void ensureCatalog()
  }, [isCartOpen, ensureCatalog])

  useEffect(() => {
    if (!isCartOpen) return

    document.body.style.overflow = "hidden"
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsCartOpen(false)
    }
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isCartOpen, setIsCartOpen])

  useEffect(() => {
    setShipping((current) => invalidateCheckoutSelection(current))
  }, [cartQuoteKey])

  const handleCepChange = (value: string) => {
    setCep(formatCep(value))
    setShipping((current) => invalidateCheckoutSelection(current))
  }

  const handleQuote = async () => {
    if (items.length === 0 || isQuoting) return

    if (!hasValidCep) {
      setShipping((current) => ({
        ...invalidateCheckoutSelection(current),
        shippingError: "Informe um CEP válido com 8 números.",
      }))
      return
    }

    setIsQuoting(true)
    setShipping((current) => ({
      ...invalidateCheckoutSelection(current),
      shippingError: null,
    }))

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
      })

      const result = (await response.json().catch(() => null)) as ShippingQuoteResponse | null
      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : "Não foi possível calcular o frete. Tente novamente.",
        )
      }

      const options = parsePublicShippingOptions(result?.options)
      if (!options || options.length === 0) {
        throw new Error("Nenhuma opção de frete disponível para este CEP.")
      }

      setShipping({
        shippingOptions: options,
        selectedShipping: options.length === 1 ? options[0] : null,
        shippingError: null,
        checkoutAttemptId: null,
      })
    } catch (error) {
      setShipping((current) => ({
        ...invalidateCheckoutSelection(current),
        shippingError:
          error instanceof Error
            ? error.message
            : "Não foi possível calcular o frete. Tente novamente.",
      }))
    } finally {
      setIsQuoting(false)
    }
  }

  const handleShippingSelect = (option: PublicShippingOption) => {
    setShipping((current) => selectShippingOption(current, option))
  }

  const handleStartCheckout = () => {
    if (!shipping.selectedShipping) {
      setShipping((current) => ({
        ...current,
        shippingError: "Escolha uma opção de frete antes de continuar.",
      }))
      return
    }

    try {
      window.localStorage.setItem(
        CHECKOUT_PREVIEW_KEY,
        JSON.stringify({
          version: 2,
          savedAt: Date.now(),
          cep: destinationCep,
          shippingServiceId: shipping.selectedShipping.serviceId,
        }),
      )
    } catch {
      // Browser storage is only a convenience; it must never block checkout.
    }

    setIsCartOpen(false)
    window.location.assign("/checkout")
  }

  if (!isCartOpen) return null

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-50 hidden cursor-default bg-black/45 md:block"
        onClick={() => setIsCartOpen(false)}
        aria-label="Fechar carrinho"
      />

      <aside
        className="fixed inset-0 z-50 flex flex-col bg-white shadow-2xl md:inset-auto md:right-0 md:top-0 md:h-full md:w-[470px] md:border-l md:border-slate-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-panel-title"
        aria-busy={isQuoting || catalogStatus === "loading"}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 text-slate-900" />
            <h2 id="cart-panel-title" className="text-lg font-medium text-slate-950">
              Carrinho de compras
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsCartOpen(false)}
            className="rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
            aria-label="Fechar carrinho"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {cartNotice && catalogStatus === "ready" ? (
            <div className="mx-5 mt-4 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
              <p>{cartNotice}</p>
              <button type="button" onClick={dismissCartNotice} aria-label="Dispensar aviso do carrinho">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {catalogStatus === "loading" ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center" role="status">
              <Loader2 className="mb-4 h-7 w-7 animate-spin text-[#8B5CF6]" />
              <p className="font-medium text-slate-800">Atualizando seu carrinho...</p>
              <p className="mt-1 text-sm text-slate-500">Conferindo produtos e preços atuais.</p>
            </div>
          ) : catalogStatus === "unavailable" ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center" role="alert">
              <ShoppingBag className="mb-4 h-12 w-12 text-slate-300" />
              <p className="font-medium text-slate-800">Não foi possível atualizar seu carrinho.</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Seus itens foram preservados. Tente novamente para conferir disponibilidade e preços.</p>
              <Button type="button" onClick={retryCatalog} className="mt-5 bg-slate-950 text-white hover:bg-slate-800">
                Tentar novamente
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
              <ShoppingBag className="mb-4 h-12 w-12 text-slate-300" />
              <p className="font-medium text-slate-800">Seu carrinho está vazio</p>
              <p className="mt-1 text-sm text-slate-500">Adicione produtos para continuar.</p>
              <Button type="button" onClick={() => setIsCartOpen(false)} className="mt-5 bg-slate-950 text-white hover:bg-slate-800">
                Ver produtos
              </Button>
            </div>
          ) : (
            <>
              <div className="p-5">
                <CartItems items={items} onUpdateQuantity={updateQuantity} onRemove={removeFromCart} />
              </div>

              <div className="border-y border-slate-200 bg-slate-50 px-5 py-5">
                <h3 className="mb-3 text-base font-medium text-slate-950">Meios de envio</h3>
                <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-[#8B5CF6] focus-within:ring-1 focus-within:ring-[#8B5CF6]/30">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={cep}
                    onChange={(event) => handleCepChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleQuote()
                    }}
                    placeholder="Seu CEP"
                    className="min-w-0 flex-1 bg-white px-3 py-3 text-base text-slate-950 outline-none placeholder:text-slate-400"
                    aria-label="CEP para cálculo do frete"
                  />
                  <button
                    type="button"
                    onClick={() => void handleQuote()}
                    disabled={isQuoting}
                    className="min-w-[96px] border-l border-slate-300 px-4 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isQuoting ? "Calculando" : "Calcular"}
                  </button>
                </div>

                <div className="mt-4">
                  {hasValidCep ? (
                    <ShippingOptions
                      options={shipping.shippingOptions}
                      selected={shipping.selectedShipping}
                      isLoading={isQuoting}
                      error={shipping.shippingError}
                      hasValidCep={hasValidCep}
                      onSelect={handleShippingSelect}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">
                      Informe um CEP válido para consultar preço e prazo de entrega.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2 px-5 py-5 text-base text-slate-900">
                <div className="flex items-center justify-between gap-4">
                  <span>Subtotal (sem frete):</span>
                  <span>{formatPrice(totalPrice)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Frete:</span>
                  <span className={shipping.selectedShipping ? "text-slate-900" : "text-slate-400"}>
                    {shipping.selectedShipping ? formatPrice(shippingPrice) : "Calcule para ver"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 pt-1 text-lg font-medium">
                  <span>Total:</span>
                  <span>{formatPrice(finalTotal)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {catalogStatus === "ready" && items.length > 0 ? (
          <div className="border-t border-slate-200 bg-white p-5">
            <Button
              type="button"
              onClick={handleStartCheckout}
              disabled={!shipping.selectedShipping || isQuoting}
              className="h-12 w-full rounded-lg bg-black text-base font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Iniciar compra
            </Button>
          </div>
        ) : null}
      </aside>
    </>
  )
}
