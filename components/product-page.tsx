"use client"

import { useState, type ComponentType } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Check,
  ChevronRight,
  Clock3,
  ImageIcon,
  Info,
  Layers3,
  ListChecks,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Truck,
  WalletCards,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StorefrontProductCard } from "@/components/storefront-product-card"
import { useCart, type Product, type StorefrontProduct } from "@/contexts/cart-context"

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

export function ProductPage({
  product,
  relatedProducts,
  productionLeadTimeBusinessDays,
}: {
  product: Product
  relatedProducts: StorefrontProduct[]
  productionLeadTimeBusinessDays: number
}) {
  const { addToCart, items, setIsCartOpen } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [justAdded, setJustAdded] = useState(false)
  const itemInCart = items.find((item) => item.product.id === product.id)
  const productionLeadTime =
    productionLeadTimeBusinessDays === 1
      ? "1 dia útil"
      : productionLeadTimeBusinessDays + " dias úteis"
  const discount = discountPercent(product)
  const displayHighlights = product.highlights?.map((highlight) =>
    PRODUCTION_LEAD_TIME_HIGHLIGHT.test(highlight.trim())
      ? "Produção em até " + productionLeadTime
      : highlight,
  )

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
    setIsCartOpen(true)
  }

  return (
    <section className="relative pb-10 pt-5 sm:pb-12 sm:pt-7">
      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
        <nav
          aria-label="Navegação estrutural"
          className="mb-5 flex min-w-0 items-center gap-2 overflow-hidden text-xs text-slate-500 sm:text-sm"
        >
          <Link href="/" className="shrink-0 transition-colors hover:text-[#7C3AED]">
            Início
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <Link href="/produtos" className="shrink-0 transition-colors hover:text-[#7C3AED]">
            Produtos
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate font-medium text-slate-700" aria-current="page">
            {product.title}
          </span>
        </nav>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
            <div className="border-b border-slate-200 p-4 sm:p-6 lg:border-b-0 lg:border-r lg:p-8">
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
                <Image
                  src={product.image}
                  alt={product.title}
                  fill
                  priority
                  sizes="(max-width: 1023px) 94vw, 560px"
                  className="object-cover"
                />
              </div>

              <div className="mt-3 flex gap-2">
                <div className="relative h-16 w-16 overflow-hidden rounded-xl border-2 border-[#8B5CF6] bg-slate-100 sm:h-20 sm:w-20">
                  <Image
                    src={product.image}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col p-5 sm:p-7 lg:p-8">
              {product.tag ? (
                <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-[#7C3AED] ring-1 ring-violet-100">
                  <Star className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                  {product.tag}
                </span>
              ) : null}

              <h1 className="text-2xl font-bold leading-[1.08] tracking-tight text-slate-950 sm:text-3xl lg:text-[36px]">
                {product.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                {product.originalPrice > product.discountPrice ? (
                  <span className="text-base text-slate-400 line-through sm:text-lg">
                    {formatPrice(product.originalPrice)}
                  </span>
                ) : null}
                <span className="text-3xl font-bold leading-none text-[#7C3AED] sm:text-4xl">
                  {formatPrice(product.discountPrice)}
                </span>
                {discount > 0 ? (
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-[#7C3AED]">
                    {discount}% OFF
                  </span>
                ) : null}
              </div>

              <p className="mt-5 text-sm leading-relaxed text-slate-600 sm:text-base">
                {product.description}
              </p>

              {displayHighlights && displayHighlights.length > 0 ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {displayHighlights.slice(0, 4).map((highlight, index) => {
                    const HighlightIcon = highlightIcons[index % highlightIcons.length]

                    return (
                      <div key={highlight + index} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[#8B5CF6]">
                          <HighlightIcon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
                        </span>
                        <p className="text-sm font-medium leading-snug text-slate-800">{highlight}</p>
                      </div>
                    )
                  })}
                </div>
              ) : null}

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

              <div className="mt-6 grid grid-cols-3 gap-2 border-t border-slate-100 pt-5">
                <div className="text-center">
                  <ShieldCheck className="mx-auto h-5 w-5 text-[#8B5CF6]" aria-hidden="true" />
                  <p className="mt-1.5 text-[11px] leading-tight text-slate-600 sm:text-xs">Compra protegida</p>
                </div>
                <div className="text-center">
                  <Truck className="mx-auto h-5 w-5 text-[#8B5CF6]" aria-hidden="true" />
                  <p className="mt-1.5 text-[11px] leading-tight text-slate-600 sm:text-xs">Produção e envio</p>
                </div>
                <div className="text-center">
                  <WalletCards className="mx-auto h-5 w-5 text-[#8B5CF6]" aria-hidden="true" />
                  <p className="mt-1.5 text-[11px] leading-tight text-slate-600 sm:text-xs">Mercado Pago</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid border-t border-slate-200 lg:grid-cols-2">
            <div className="p-5 sm:p-7 lg:border-r lg:border-slate-200 lg:p-8">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-[#8B5CF6]">
                  <Info className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-950">Informações importantes</h2>
                  {product.notice && product.notice.trim().toLowerCase() !== "informações importantes" ? (
                    <p className="mt-1 text-sm text-slate-600">{product.notice}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {product.details.map((detail) => {
                  const DetailIcon = detailIcon(detail.label)
                  return (
                    <div key={detail.label} className="flex gap-3 rounded-xl bg-slate-50 p-3.5">
                      <DetailIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#8B5CF6]" strokeWidth={2} aria-hidden="true" />
                      <div>
                        <p className="text-xs font-bold text-slate-950">{detail.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">{detail.value}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="p-5 sm:p-7 lg:p-8">
              <h2 className="text-xl font-bold tracking-tight text-slate-950">Descrição</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">{product.description}</p>

              <div className="mt-6 space-y-4">
                {product.sections.map((section) => {
                  const paragraphs =
                    section.title.trim().toUpperCase() === "PRAZO"
                      ? ["Produção e postagem em até " + productionLeadTime + "."]
                      : section.paragraphs
                  const SectionIcon = detailIcon(section.title)

                  return (
                    <div key={section.title} className="flex gap-3 border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                      <SectionIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#8B5CF6]" strokeWidth={2} aria-hidden="true" />
                      <div>
                        <h3 className="text-sm font-bold text-slate-950">{section.title}</h3>
                        {paragraphs.map((paragraph) => (
                          <p key={paragraph} className="mt-1 text-sm leading-relaxed text-slate-600">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {relatedProducts.length > 0 ? (
          <section className="mt-8 sm:mt-10" aria-labelledby="related-products-title">
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 id="related-products-title" className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                Produtos relacionados
              </h2>
              <Link href="/produtos" className="text-sm font-medium text-[#7C3AED] hover:text-[#6D28D9]">
                Ver todos
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {relatedProducts.map((relatedProduct) => (
                <StorefrontProductCard key={relatedProduct.id} product={relatedProduct} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  )
}
