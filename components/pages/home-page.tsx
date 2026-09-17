"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { ArrowLeft, ArrowRight, ShoppingCart } from "lucide-react"
import { ProductDetailModal } from "@/components/product-detail-modal"
import { useCart, type Product } from "@/contexts/cart-context"

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

function AddToCartButton({ product }: { product: Product }) {
  const { addToCart, items } = useCart()
  const quantity = items.find((item) => item.product.id === product.id)?.quantity ?? 0

  return (
    <button
      type="button"
      onClick={() => addToCart(product)}
      aria-label={`Adicionar ${product.title} ao carrinho`}
      className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] px-4 text-sm font-semibold text-white transition hover:bg-[#7C3AED] active:scale-[0.99] sm:text-base"
    >
      <ShoppingCart className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {quantity > 0 ? `Adicionar ao carrinho (${quantity})` : "Adicionar ao carrinho"}
      </span>
    </button>
  )
}

export function HomePage({
  products,
  unavailable = false,
  productionLeadTimeBusinessDays,
}: {
  products: Product[]
  unavailable?: boolean
  productionLeadTimeBusinessDays: number
}) {
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(products.length > 1)
  const [activePage, setActivePage] = useState(0)

  const openProductModal = (product: Product) => {
    setSelectedProduct(product)
    setIsModalOpen(true)
  }

  const closeProductModal = () => {
    setIsModalOpen(false)
    setSelectedProduct(null)
  }

  const updateScrollState = () => {
    const carousel = carouselRef.current
    if (!carousel) return

    const slideWidth = Math.max(carousel.clientWidth, 1)
    const lastPage = Math.max(products.length - 1, 0)
    const nextActivePage = Math.min(lastPage, Math.max(0, Math.round(carousel.scrollLeft / slideWidth)))

    setActivePage(nextActivePage)
    setCanScrollLeft(nextActivePage > 0)
    setCanScrollRight(nextActivePage < lastPage)
  }

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    updateScrollState()

    const handleResize = () => updateScrollState()
    window.addEventListener("resize", handleResize)

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize)
    resizeObserver?.observe(carousel)

    return () => {
      window.removeEventListener("resize", handleResize)
      resizeObserver?.disconnect()
    }
  }, [products])

  const scrollToPage = (page: number) => {
    const carousel = carouselRef.current
    if (!carousel) return

    const lastPage = Math.max(products.length - 1, 0)
    const nextPage = Math.min(lastPage, Math.max(0, page))

    carousel.scrollTo({
      left: nextPage * carousel.clientWidth,
      behavior: "smooth",
    })
  }

  const scrollFeatured = (direction: -1 | 1) => {
    scrollToPage(activePage + direction)
  }

  return (
    <>
      <section className="bg-white pb-10 pt-6 lg:pb-12 lg:pt-8">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <h1 className="mb-5 text-3xl font-bold tracking-tight text-slate-950 lg:mb-6 lg:text-[32px]">
            Destaques
          </h1>

          {unavailable ? (
            <div className="border border-slate-200 bg-slate-50 px-5 py-8 text-center" role="status">
              <p className="text-base font-medium text-slate-700">Catálogo temporariamente indisponível.</p>
              <p className="mt-1 text-sm text-slate-500">Tente novamente em alguns instantes.</p>
            </div>
          ) : null}

          {!unavailable && products.length === 0 ? (
            <div className="border border-slate-200 bg-slate-50 px-5 py-8 text-center">
              <p className="text-base text-slate-600">Nenhum produto disponível no momento.</p>
            </div>
          ) : null}

          {!unavailable && products.length > 0 ? (
            <div className="relative mx-auto max-w-[860px]">
              {products.length > 1 ? (
                <button
                  type="button"
                  onClick={() => scrollFeatured(-1)}
                  disabled={!canScrollLeft}
                  aria-label="Ver produto anterior"
                  className="absolute left-0 top-1/2 z-20 flex h-11 w-11 -translate-x-1 -translate-y-1/2 items-center justify-center rounded-full bg-violet-50 text-slate-950 shadow-sm ring-1 ring-violet-100 transition hover:bg-violet-100 disabled:cursor-default disabled:opacity-25 sm:h-12 sm:w-12 md:-translate-x-2"
                >
                  <ArrowLeft className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : null}

              <div
                ref={carouselRef}
                onScroll={updateScrollState}
                aria-label="Produtos em destaque"
                className="snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex">
                  {products.map((product, index) => {
                    const discount = discountPercent(product)

                    return (
                      <div key={product.id} className="w-full shrink-0 snap-center px-7 py-1 sm:px-10 md:px-12">
                        <article
                          aria-label={`Destaque ${index + 1} de ${products.length}`}
                          className="group mx-auto w-full max-w-[760px] rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_8px_28px_rgba(15,23,42,0.08)] sm:p-4 md:p-5"
                        >
                          <button
                            type="button"
                            onClick={() => openProductModal(product)}
                            className="grid w-full grid-cols-1 gap-4 text-left md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:items-center md:gap-6"
                            aria-label={`Ver detalhes de ${product.title}`}
                          >
                            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-100">
                              <Image
                                src={product.image}
                                alt={product.title}
                                fill
                                sizes="(max-width: 767px) 76vw, 390px"
                                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                              />
                            </div>

                            <div className="flex min-w-0 flex-col justify-center px-1 pb-1 md:px-0 md:py-2">
                              <h2 className="text-xl font-normal leading-tight text-slate-950 sm:text-2xl md:text-[26px]">
                                {product.title}
                              </h2>

                              {product.originalPrice > product.discountPrice ? (
                                <p className="mt-4 text-base text-slate-500 line-through md:mt-5 md:text-lg">
                                  {formatPrice(product.originalPrice)}
                                </p>
                              ) : (
                                <div className="mt-4 h-6 md:mt-5" aria-hidden="true" />
                              )}

                              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <span className="text-3xl font-bold leading-tight text-slate-950 md:text-[34px]">
                                  {formatPrice(product.discountPrice)}
                                </span>
                                {discount > 0 ? (
                                  <span className="text-base font-medium text-red-500 md:text-lg">{discount}% OFF</span>
                                ) : null}
                              </div>
                            </div>
                          </button>

                          <AddToCartButton product={product} />
                        </article>
                      </div>
                    )
                  })}
                </div>
              </div>

              {products.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => scrollFeatured(1)}
                    disabled={!canScrollRight}
                    aria-label="Ver próximo produto"
                    className="absolute right-0 top-1/2 z-20 flex h-11 w-11 translate-x-1 -translate-y-1/2 items-center justify-center rounded-full bg-violet-50 text-slate-950 shadow-sm ring-1 ring-violet-100 transition hover:bg-violet-100 disabled:cursor-default disabled:opacity-25 sm:h-12 sm:w-12 md:translate-x-2"
                  >
                    <ArrowRight className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.8} aria-hidden="true" />
                  </button>

                  <div className="mt-5 flex items-center justify-center gap-2.5" aria-label="Produtos em destaque">
                    {products.map((product, index) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => scrollToPage(index)}
                        aria-label={`Ir para produto ${index + 1}`}
                        aria-current={activePage === index ? "true" : undefined}
                        className={`rounded-full transition-all ${
                          activePage === index
                            ? "h-2.5 w-2.5 bg-[#8B5CF6]"
                            : "h-2 w-2 bg-slate-200 hover:bg-slate-300"
                        }`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {selectedProduct ? (
        <ProductDetailModal
          product={selectedProduct}
          isOpen={isModalOpen}
          onClose={closeProductModal}
          productionLeadTimeBusinessDays={productionLeadTimeBusinessDays}
        />
      ) : null}
    </>
  )
}
