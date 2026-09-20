"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Check, CreditCard, Loader2, ShoppingCart, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CheckoutForm } from "@/components/checkout-form"
import { OrderSummary } from "@/components/order-summary"
import { ShippingOptions } from "@/components/shipping-options"
import { useCart } from "@/contexts/cart-context"
import {
  applyCheckoutSavedAddress,
  checkoutMatchesSavedAddress,
  digitsOnly,
  formatCep,
  formatPrice,
  formatWhatsapp,
  selectCheckoutSavedAddress,
  validateCheckout,
  type CheckoutCustomerPrefill,
  type CheckoutData,
  type CheckoutErrors,
  type CheckoutSavedAddress,
} from "@/lib/checkout"
import {
  applyShippingChanged,
  invalidateCheckoutSelection,
  parsePublicShippingOptions,
  selectShippingOption,
  type ShippingClientState,
} from "@/lib/shipping-client"
import { isAllowedMercadoPagoCheckoutUrl } from "@/lib/server/checkout-url"
import type { PublicShippingOption } from "@/lib/server/shipping-quote"

const CHECKOUT_PREVIEW_KEY = "proxybembem-checkout-preview-v2"
const CHECKOUT_PREVIEW_TTL_MS = 2 * 60 * 60 * 1000

const EMPTY_CHECKOUT: CheckoutData = {
  nome: "",
  email: "",
  whatsapp: "",
  cpf: "",
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

type CepLookupStatus = "idle" | "loading" | "found" | "unavailable"

interface CepLookupAddress {
  cep: string
  street: string
  neighborhood: string
  city: string
  state: string
}

function parseCepLookupAddress(value: unknown, expectedCep: string): CepLookupAddress | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<CepLookupAddress>
  if (
    candidate.cep !== expectedCep ||
    typeof candidate.street !== "string" ||
    typeof candidate.neighborhood !== "string" ||
    typeof candidate.city !== "string" ||
    candidate.city.length < 2 ||
    candidate.city.length > 80 ||
    typeof candidate.state !== "string" ||
    !/^[A-Z]{2}$/.test(candidate.state)
  ) {
    return null
  }

  return candidate as CepLookupAddress
}

interface CheckoutPreview {
  version: 2
  savedAt: number
  cep: string
  shippingServiceId: string | null
}

function writeCheckoutPreview(
  storage: Storage,
  cep: string,
  shippingServiceId: string | null,
) {
  const normalizedCep = digitsOnly(cep)
  if (!/^\d{8}$/.test(normalizedCep)) return
  try {
    storage.setItem(
      CHECKOUT_PREVIEW_KEY,
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        cep: normalizedCep,
        shippingServiceId,
      }),
    )
  } catch {
    // Checkout can continue even if browser storage is unavailable.
  }
}

function readCheckoutPreview(storage: Storage): CheckoutPreview | null {
  try {
    const raw = storage.getItem(CHECKOUT_PREVIEW_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<CheckoutPreview>
    const cep = typeof value.cep === "string" ? digitsOnly(value.cep) : ""
    const now = Date.now()
    const shippingServiceId =
      typeof value.shippingServiceId === "string" && value.shippingServiceId
        ? value.shippingServiceId
        : null

    if (
      value.version !== 2 ||
      typeof value.savedAt !== "number" ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > now + 60_000 ||
      now - value.savedAt > CHECKOUT_PREVIEW_TTL_MS ||
      !/^\d{8}$/.test(cep)
    ) {
      storage.removeItem(CHECKOUT_PREVIEW_KEY)
      return null
    }
    return { version: 2, savedAt: value.savedAt, cep, shippingServiceId }
  } catch {
    return null
  }
}

export function CheckoutPage({
  savedAddresses = [],
  customerPrefill,
}: {
  savedAddresses?: CheckoutSavedAddress[]
  customerPrefill: CheckoutCustomerPrefill
}) {
  const {
    items,
    totalPrice,
    catalogStatus,
    retryCatalog,
  } = useCart()
  const [checkout, setCheckout] = useState<CheckoutData>({
    ...EMPTY_CHECKOUT,
    nome: customerPrefill.name,
    email: customerPrefill.email,
    whatsapp: formatWhatsapp(customerPrefill.whatsapp),
  })
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [shipping, setShipping] = useState<ShippingClientState>(EMPTY_SHIPPING)
  const [isQuoting, setIsQuoting] = useState(false)
  const [shippingQuoteRevision, setShippingQuoteRevision] = useState(0)
  const [cepLookupStatus, setCepLookupStatus] = useState<CepLookupStatus>("idle")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const restoredShippingServiceIdRef = useRef<string | null>(null)
  const initializedRef = useRef(false)
  const previewCepRef = useRef<string | null>(null)
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | null>(null)
  const [saveNewAddress, setSaveNewAddress] = useState(savedAddresses.length < 5)

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
    if (initializedRef.current) return
    initializedRef.current = true

    const preview = readCheckoutPreview(window.localStorage)
    previewCepRef.current = preview?.cep ?? null

    const selectedAddress = selectCheckoutSavedAddress(
      savedAddresses,
      preview?.cep ?? null,
    )

    if (selectedAddress) {
      setSelectedSavedAddressId(selectedAddress.id)
      setCheckout((current) => applyCheckoutSavedAddress(current, selectedAddress))
    } else if (preview) {
      setCheckout((current) => ({ ...current, cep: formatCep(preview.cep) }))
    }

    if (preview) {
      restoredShippingServiceIdRef.current = preview.shippingServiceId
    }
  }, [savedAddresses])

  useEffect(() => {
    setShipping((current) => invalidateCheckoutSelection(current))
    setCheckoutError(null)

    if (catalogStatus !== "ready" || !hasValidCep || items.length === 0) {
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

        const options = parsePublicShippingOptions(result?.options)
        if (!options || options.length === 0) {
          throw new Error("Nenhuma opção de frete disponível para este CEP.")
        }

        const restoredServiceId = restoredShippingServiceIdRef.current
        const restoredOption = restoredServiceId
          ? options.find((option) => option.serviceId === restoredServiceId) ?? null
          : null
        restoredShippingServiceIdRef.current = null

        setShipping({
          shippingOptions: options,
          selectedShipping: restoredOption ?? (options.length === 1 ? options[0] : null),
          shippingError: null,
          checkoutAttemptId: null,
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setShipping((current) => ({
          ...invalidateCheckoutSelection(current),
          shippingError:
            error instanceof Error
              ? error.message
              : "Não foi possível calcular o frete. Tente novamente.",
        }))
      } finally {
        if (!controller.signal.aborted) setIsQuoting(false)
      }
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [
    cartQuoteKey,
    catalogStatus,
    destinationCep,
    hasValidCep,
    items,
    shippingQuoteRevision,
  ])

  useEffect(() => {
    if (selectedSavedAddressId !== null || !hasValidCep) {
      setCepLookupStatus("idle")
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setCepLookupStatus("loading")

      try {
        const response = await fetch("/api/address/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cep: destinationCep }),
          signal: controller.signal,
        })
        const payload = (await response.json().catch(() => null)) as {
          address?: unknown
        } | null
        const address = parseCepLookupAddress(payload?.address, destinationCep)

        if (!response.ok || !address) {
          setCepLookupStatus("unavailable")
          return
        }

        setCheckout((current) => {
          if (digitsOnly(current.cep) !== destinationCep) return current
          return {
            ...current,
            rua: address.street,
            bairro: address.neighborhood,
            cidade: address.city,
            uf: address.state,
          }
        })
        setErrors((current) => ({
          ...current,
          rua: address.street ? undefined : current.rua,
          bairro: address.neighborhood ? undefined : current.bairro,
          cidade: undefined,
          uf: undefined,
        }))
        setCepLookupStatus("found")
      } catch {
        if (!controller.signal.aborted) setCepLookupStatus("unavailable")
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [destinationCep, hasValidCep, selectedSavedAddressId])

  const handleCheckoutChange = (field: keyof CheckoutData, value: string) => {
    if (field === "cep") {
      const normalizedCep = digitsOnly(value)

      setCheckout((current) => {
        const cepChanged = digitsOnly(current.cep) !== normalizedCep
        return {
          ...current,
          cep: value,
          ...(cepChanged
            ? {
                rua: "",
                bairro: "",
                cidade: "",
                uf: "",
              }
            : {}),
        }
      })
      setErrors((current) => ({
        ...current,
        cep: undefined,
        rua: undefined,
        bairro: undefined,
        cidade: undefined,
        uf: undefined,
      }))
      setCheckoutError(null)
      setCepLookupStatus("idle")
      restoredShippingServiceIdRef.current = null
      setSelectedSavedAddressId(null)
      previewCepRef.current = /^\d{8}$/.test(normalizedCep) ? normalizedCep : null

      if (/^\d{8}$/.test(normalizedCep)) {
        writeCheckoutPreview(window.localStorage, normalizedCep, null)
      }

      setShipping((current) => invalidateCheckoutSelection(current))
      return
    }

    setCheckout((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setCheckoutError(null)
    setShipping((current) => ({ ...current, checkoutAttemptId: null }))
  }

  const handleSavedAddressSelect = (address: CheckoutSavedAddress) => {
    restoredShippingServiceIdRef.current = null
    const selectedCep = digitsOnly(address.cep)
    previewCepRef.current = selectedCep
    setCepLookupStatus("idle")
    setSelectedSavedAddressId(address.id)
    setCheckout((current) => applyCheckoutSavedAddress(current, address))
    setErrors((current) => ({
      ...current,
      cep: undefined,
      rua: undefined,
      numero: undefined,
      complemento: undefined,
      bairro: undefined,
      cidade: undefined,
      uf: undefined,
    }))
    setShipping((current) => invalidateCheckoutSelection(current))
    setShippingQuoteRevision((current) => current + 1)
    writeCheckoutPreview(window.localStorage, address.cep, null)
    setCheckoutError(null)
  }

  const handleUseNewAddress = () => {
    restoredShippingServiceIdRef.current = null
    setCepLookupStatus("idle")
    setSelectedSavedAddressId(null)
    const preservedCep = previewCepRef.current ?? digitsOnly(checkout.cep)

    setCheckout((current) => ({
      ...current,
      cep: /^\d{8}$/.test(preservedCep) ? formatCep(preservedCep) : "",
      rua: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      uf: "",
    }))
    setErrors((current) => ({
      ...current,
      cep: undefined,
      rua: undefined,
      numero: undefined,
      complemento: undefined,
      bairro: undefined,
      cidade: undefined,
      uf: undefined,
    }))
    setShipping((current) => invalidateCheckoutSelection(current))
    setShippingQuoteRevision((current) => current + 1)
    if (/^\d{8}$/.test(preservedCep)) {
      writeCheckoutPreview(window.localStorage, preservedCep, null)
    }
    setCheckoutError(null)
  }

  const handleShippingSelect = (option: PublicShippingOption) => {
    restoredShippingServiceIdRef.current = null
    setShipping((current) => selectShippingOption(current, option))
    writeCheckoutPreview(window.localStorage, checkout.cep, option.serviceId)
    setCheckoutError(null)
  }

  const saveCheckoutAddressForFuture = async () => {
    if (
      !saveNewAddress ||
      selectedSavedAddressId ||
      savedAddresses.length >= 5 ||
      savedAddresses.some((address) => checkoutMatchesSavedAddress(checkout, address))
    ) {
      return
    }

    try {
      await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: savedAddresses.length === 0 ? "Principal" : `Endereço ${savedAddresses.length + 1}`,
          cep: digitsOnly(checkout.cep),
          street: checkout.rua,
          number: checkout.numero,
          complement: checkout.complemento,
          neighborhood: checkout.bairro,
          city: checkout.cidade,
          state: checkout.uf,
          isDefault: savedAddresses.length === 0,
        }),
      })
    } catch {
      // Saving the reusable address is a convenience and must not block payment.
    }
  }

  const handleCheckout = async () => {
    if (items.length === 0 || isSubmitting || isQuoting || catalogStatus !== "ready") return

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
          writeCheckoutPreview(
            window.localStorage,
            checkout.cep,
            shipping.selectedShipping.serviceId,
          )
          window.location.assign("/entrar?next=%2Fcheckout")
          return
        }

        if (result?.fieldErrors) setErrors(result.fieldErrors)

        if (result?.code === "shipping_changed") {
          const options = parsePublicShippingOptions(result.options)
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

      await saveCheckoutAddressForFuture()
      try {
        window.localStorage.removeItem(CHECKOUT_PREVIEW_KEY)
      } catch {
        // Storage cleanup is optional and must never block payment navigation.
      }
      window.location.assign(result.checkoutUrl)
    } catch {
      setCheckoutError("Não foi possível iniciar o pagamento. Tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-center px-4 sm:h-20">
          <Link href="/produtos" className="flex items-center gap-2" aria-label="Voltar aos produtos">
            <img src="/brand/pb" alt="" aria-hidden="true" className="h-11 w-auto object-contain" />
            <span className="text-xl tracking-wide font-[family-name:var(--font-display)]">ProxyBembem</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <ol className="mx-auto mb-8 grid max-w-2xl grid-cols-3 items-start" aria-label="Etapas da compra">
          <li className="relative flex flex-col items-center text-center">
            <span className="absolute left-1/2 top-4 h-px w-full bg-slate-300" aria-hidden="true" />
            <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-900 bg-white text-slate-900">
              <Check className="h-4 w-4" />
            </span>
            <span className="mt-2 text-sm text-slate-600">Carrinho</span>
          </li>
          <li className="relative flex flex-col items-center text-center" aria-current="step">
            <span className="absolute left-1/2 top-4 h-px w-full bg-slate-300" aria-hidden="true" />
            <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-950 bg-white text-slate-950">
              <Truck className="h-4 w-4" />
            </span>
            <span className="mt-2 text-sm font-medium text-slate-950">Entrega</span>
          </li>
          <li className="relative flex flex-col items-center text-center">
            <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400">
              <CreditCard className="h-4 w-4" />
            </span>
            <span className="mt-2 text-sm text-slate-500">Pagamento</span>
          </li>
        </ol>

        {catalogStatus === "loading" ? (
          <div className="flex min-h-[420px] items-center justify-center" role="status">
            <div className="text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#8B5CF6]" />
              <p className="mt-3 text-sm text-slate-500">Carregando seu carrinho...</p>
            </div>
          </div>
        ) : catalogStatus === "unavailable" ? (
          <div className="mx-auto max-w-lg rounded-xl border border-slate-200 p-8 text-center" role="alert">
            <h1 className="text-xl font-semibold">Não foi possível carregar seu carrinho</h1>
            <p className="mt-2 text-slate-500">Tente novamente antes de continuar com a compra.</p>
            <Button type="button" onClick={retryCatalog} className="mt-5 bg-black text-white hover:bg-slate-800">
              Tentar novamente
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="mx-auto max-w-lg rounded-xl border border-slate-200 p-8 text-center">
            <ShoppingCart className="mx-auto h-10 w-10 text-slate-300" />
            <h1 className="mt-4 text-xl font-semibold">Seu carrinho está vazio</h1>
            <p className="mt-2 text-slate-500">Adicione um produto antes de iniciar a compra.</p>
            <Button asChild className="mt-5 bg-black text-white hover:bg-slate-800">
              <Link href="/produtos">Voltar aos produtos</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <CheckoutForm
                data={checkout}
                errors={errors}
                savedAddresses={savedAddresses}
                selectedSavedAddressId={selectedSavedAddressId}
                saveNewAddress={saveNewAddress}
                canSaveNewAddress={savedAddresses.length < 5}
                onSelectSavedAddress={handleSavedAddressSelect}
                onUseNewAddress={handleUseNewAddress}
                onSaveNewAddressChange={setSaveNewAddress}
                onChange={handleCheckoutChange}
              />

              <div className="mt-7 border-t border-slate-200 pt-6">
                <ShippingOptions
                  options={shipping.shippingOptions}
                  selected={shipping.selectedShipping}
                  isLoading={isQuoting}
                  error={shipping.shippingError}
                  hasValidCep={hasValidCep}
                  onSelect={handleShippingSelect}
                />
              </div>
            </section>

            <aside className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm lg:sticky lg:top-6">
              <h2 className="mb-4 text-base font-semibold text-slate-950">Resumo do pedido</h2>
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.product.id} className="flex gap-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <Image
                        src={item.product.image}
                        unoptimized={item.product.image.startsWith("/")}
                        alt={item.product.title}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                      <span className="absolute -right-1 -top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-700 px-1 text-[11px] font-bold text-white">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-slate-900">{item.product.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{formatPrice(item.product.discountPrice * item.quantity)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <OrderSummary
                totalPrice={totalPrice}
                selectedShipping={shipping.selectedShipping}
                isQuoting={isQuoting}
                isSubmitting={isSubmitting}
                checkoutError={checkoutError}
                whatsappFallbackUrl={null}
                onCheckout={() => void handleCheckout()}
              />
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
