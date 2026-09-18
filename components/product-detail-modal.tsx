"use client"

import { useState, type ComponentType } from "react"
import Image from "next/image"
import {
  Check,
  Clock3,
  ImageIcon,
  Info,
  Layers3,
  ListChecks,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useCart, type Product } from "@/contexts/cart-context"

const PRODUCTION_LEAD_TIME_HIGHLIGHT =
  /^produção\s+em\s+até\s+\d+\s+(?:dia\s+útil|dias\s+úteis)\.?$/i

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function discountPercent(product: Product) {
  if (product.originalPrice <= product.discountPrice) return 0
  return Math.round((1 - product.discountPrice / product.originalPrice) * 100)
}

function detailIcon(label: string): ComponentType<{ className?: string; strokeWidth?: number }> {
  const normalizedLabel = label.trim().toUpperCase()

  if (normalizedLabel.includes("QUALIDADE")) return Star
  if (normalizedLabel.includes("VERSO")) return ShieldCheck
  if (normalizedLabel.includes("ESCOLHER") || normalizedLabel.includes("LISTA")) return ListChecks
  if (normalizedLabel.includes("ARTE")) return ImageIcon
  if (normalizedLabel.includes("RECEBE") || normalizedLabel.includes("INCLUS")) return PackageCheck
  if (normalizedLabel.includes("PRAZO") || normalizedLabel.includes("PRODU")) return Clock3
  if (normalizedLabel.includes("IMPORTANTE") || normalizedLabel.includes("AVISO")) return Info

  return Layers3
}

const highlightIcons = [Layers3, Sparkles, Clock3]

interface ProductDetailModalProps {
  product: Product
  isOpen: boolean
  onClose: () => void
  productionLeadTimeBusinessDays: number
}

export function ProductDetailModal({
  product,
  isOpen,
  onClose,
  productionLeadTimeBusinessDays,
}: ProductDetailModalProps) {
  const { addToCart, items } = useCart()
  const [justAdded, setJustAdded] = useState(false)

  const itemInCart = items.find((item) => item.product.id === product.id)
  const productionLeadTime =
    productionLeadTimeBusinessDays === 1
      ? "1 dia útil"
      : `${productionLeadTimeBusinessDays} dias úteis`
  const discount = discountPercent(product)
  const displayHighlights = product.highlights?.map((highlight) =>
    PRODUCTION_LEAD_TIME_HIGHLIGHT.test(highlight.trim())
      ? `Produção em até ${productionLeadTime}`
      : highlight,
  )

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
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-1rem)] max-w-[980px] gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl sm:max-w-[980px]"
      >
        <DialogTitle className="sr-only">{product.title}</DialogTitle>

        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-950 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95 sm:right-4 sm:top-4"
          type="button"
          aria-label="Fechar detalhes do produto"
        >
          <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </button>

        <div className="max-h-[94dvh] overflow-y-auto overscroll-contain p-4 sm:p-5 lg:p-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-7">
            <div className="min-w-0">
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-100">
                <Image
                  src={product.image}
                  unoptimized={product.image.startsWith("/")}
                  alt={product.title}
                  fill
                  priority
                  sizes="(max-width: 1023px) 90vw, 500px"
                  className="object-cover"
                />
              </div>

              <div className="mt-5 lg:hidden">
                <h3 className="text-xl font-bold tracking-tight text-slate-950">Descrição</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-700 sm:text-base">
                  {product.description}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-col">
              {product.tag ? (
                <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-[#7C3AED] ring-1 ring-violet-100 sm:text-sm">
                  <Star className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                  {product.tag}
                </span>
              ) : null}

              <h2 className="pr-10 text-2xl font-bold leading-[1.08] tracking-tight text-slate-950 sm:text-3xl lg:text-[34px]">
                {product.title}
              </h2>

              <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {product.originalPrice > product.discountPrice ? (
                  <span className="text-base text-slate-500 line-through sm:text-lg">
                    {formatPrice(product.originalPrice)}
                  </span>
                ) : null}
                <span className="text-3xl font-bold leading-none text-slate-950 sm:text-4xl">
                  {formatPrice(product.discountPrice)}
                </span>
                {discount > 0 ? (
                  <span className="text-base font-medium text-red-500 sm:text-lg">{discount}% OFF</span>
                ) : null}
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-600 sm:text-base">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                </span>
                Disponível para pedido
              </div>

              {displayHighlights && displayHighlights.length > 0 ? (
                <div className="mt-5 space-y-3 sm:mt-6">
                  {displayHighlights.map((highlight, index) => {
                    const HighlightIcon = highlightIcons[index % highlightIcons.length]

                    return (
                      <div key={`${highlight}-${index}`} className="flex items-center gap-3 sm:gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[#8B5CF6] sm:h-12 sm:w-12">
                          <HighlightIcon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} aria-hidden="true" />
                        </span>
                        <p className="text-sm font-semibold leading-snug text-slate-900 sm:text-base">
                          {highlight}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              <div className="mt-6 hidden lg:block">
                <h3 className="text-xl font-bold tracking-tight text-slate-950">Descrição</h3>
                <p className="mt-2 text-base leading-relaxed text-slate-700">{product.description}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-5 sm:mt-7 sm:pt-6">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[#8B5CF6]">
                <Info className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-950">Informações importantes</h3>
                {product.notice && product.notice.trim().toLowerCase() !== "informações importantes" ? (
                  <p className="mt-1 text-sm text-slate-600 sm:text-base">{product.notice}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {product.details.map((detail) => {
                const DetailIcon = detailIcon(detail.label)

                return (
                  <div
                    key={detail.label}
                    className="flex gap-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3.5 sm:p-4"
                  >
                    <DetailIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#8B5CF6]" strokeWidth={2} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-950">
                        {detail.label}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">{detail.value}</p>
                    </div>
                  </div>
                )
              })}

              {product.sections.map((section) => {
                const paragraphs =
                  section.title.trim().toUpperCase() === "PRAZO"
                    ? [`Produção e postagem em até ${productionLeadTime}.`]
                    : section.paragraphs
                const SectionIcon = detailIcon(section.title)

                return (
                  <section
                    key={section.title}
                    className="flex gap-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3.5 sm:p-4"
                  >
                    <SectionIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#8B5CF6]" strokeWidth={2} aria-hidden="true" />
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-950">
                        {section.title}
                      </h3>
                      {paragraphs.map((paragraph) => (
                        <p key={paragraph} className="mt-1 text-sm leading-relaxed text-slate-700">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>

          {itemInCart ? (
            <p className="mt-4 text-center text-sm text-slate-600" aria-live="polite">
              Você já tem {itemInCart.quantity} unidade{itemInCart.quantity > 1 ? "s" : ""} no carrinho
            </p>
          ) : null}

          <Button
            onClick={handleAddToCart}
            size="lg"
            type="button"
            className={`mt-5 h-14 w-full rounded-xl text-base font-semibold tracking-wide text-white shadow-sm transition-all duration-300 active:scale-[0.99] sm:text-lg ${
              justAdded
                ? "bg-green-500 hover:bg-green-600"
                : "bg-[#8B5CF6] hover:bg-[#7C3AED]"
            }`}
          >
            {justAdded ? (
              <>
                <Check className="mr-2 h-5 w-5" />
                Adicionado ao Carrinho!
              </>
            ) : (
              <>
                <ShoppingCart className="mr-2 h-5 w-5" />
                Adicionar ao Carrinho
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
