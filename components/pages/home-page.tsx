"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { ProductDetailModal } from "@/components/product-detail-modal"
import { StorefrontProductCard } from "@/components/storefront-product-card"
import type { Product } from "@/contexts/cart-context"

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

  const updateScrollState = useCallback(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    const slideWidth = Math.max(carousel.clientWidth, 1)
    const lastPage = Math.max(products.length - 1, 0)
    const nextActivePage = Math.min(
      lastPage,
      Math.max(0, Math.round(carousel.scrollLeft / slideWidth)),
    )

    setActivePage(nextActivePage)
    setCanScrollLeft(nextActivePage > 0)
    setCanScrollRight(nextActivePage < lastPage)
  }, [products.length])

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
  }, [updateScrollState])

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
                  {products.map((product, index) => (
                    <div
                      key={product.id}
                      aria-label={`Destaque ${index + 1} de ${products.length}`}
                      className="w-full shrink-0 snap-center px-7 py-1 sm:px-10 md:px-12"
                    >
                      <StorefrontProductCard
                        product={product}
                        onViewDetails={openProductModal}
                        className="mx-auto w-full max-w-[760px]"
                      />
                    </div>
                  ))}
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
