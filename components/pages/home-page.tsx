"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ProductDetailModal } from "@/components/product-detail-modal"
import type { Product } from "@/contexts/cart-context"

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
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [pageCount, setPageCount] = useState(1)
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

    const maxScrollLeft = Math.max(carousel.scrollWidth - carousel.clientWidth, 0)
    const nextPageCount = Math.max(1, Math.ceil(maxScrollLeft / Math.max(carousel.clientWidth, 1)) + 1)
    const nextActivePage = Math.min(
      nextPageCount - 1,
      Math.max(0, Math.round(carousel.scrollLeft / Math.max(carousel.clientWidth, 1))),
    )

    setCanScrollLeft(carousel.scrollLeft > 4)
    setCanScrollRight(maxScrollLeft - carousel.scrollLeft > 4)
    setPageCount(nextPageCount)
    setActivePage(nextActivePage)
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

  const scrollFeatured = (direction: -1 | 1) => {
    const carousel = carouselRef.current
    if (!carousel) return

    carousel.scrollBy({
      left: direction * Math.max(carousel.clientWidth * 0.88, 280),
      behavior: "smooth",
    })
  }

  const scrollToPage = (page: number) => {
    const carousel = carouselRef.current
    if (!carousel) return

    carousel.scrollTo({
      left: page * carousel.clientWidth,
      behavior: "smooth",
    })
  }

  return (
    <>
      <section className="min-h-[70vh] bg-white pb-12 pt-20 sm:pb-16 sm:pt-24">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-8 lg:px-12">
          <h1 className="mb-5 text-2xl font-bold tracking-tight text-slate-950 sm:mb-6 sm:text-3xl">
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
            <div className="relative">
              <button
                type="button"
                onClick={() => scrollFeatured(-1)}
                disabled={!canScrollLeft}
                aria-label="Ver produtos anteriores"
                className="absolute left-0 top-[92px] z-20 flex h-11 w-11 -translate-x-2 items-center justify-center text-slate-950 transition hover:scale-110 disabled:cursor-default disabled:opacity-25 disabled:hover:scale-100 sm:-translate-x-7 lg:-translate-x-10"
              >
                <ChevronLeft className="h-7 w-7" aria-hidden="true" />
              </button>

              <div
                ref={carouselRef}
                onScroll={updateScrollState}
                aria-label="Produtos em destaque"
                className="snap-x snap-mandatory overflow-x-auto scroll-smooth pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex w-max min-w-full justify-start gap-4 px-8 sm:px-0">
                  {products.map((product) => {
                    const discount = discountPercent(product)

                    return (
                      <article
                        key={product.id}
                        className="group w-[74vw] max-w-[220px] shrink-0 snap-start sm:w-[210px] lg:w-[198px]"
                      >
                        <button
                          type="button"
                          onClick={() => openProductModal(product)}
                          className="block w-full text-left"
                          aria-label={`Ver detalhes de ${product.title}`}
                        >
                          <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
                            <Image
                              src={product.image}
                              alt={product.title}
                              fill
                              sizes="(max-width: 640px) 74vw, (max-width: 1024px) 210px, 198px"
                              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          </div>

                          <div className="pt-3">
                            <h2 className="min-h-[2.6rem] text-[15px] font-normal leading-[1.35] text-slate-900 line-clamp-2">
                              {product.title}
                            </h2>

                            {product.originalPrice > product.discountPrice ? (
                              <p className="mt-2 text-xs text-slate-500 line-through">
                                {formatPrice(product.originalPrice)}
                              </p>
                            ) : (
                              <div className="mt-2 h-4" aria-hidden="true" />
                            )}

                            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span className="text-lg font-bold leading-tight text-slate-950">
                                {formatPrice(product.discountPrice)}
                              </span>
                              {discount > 0 ? (
                                <span className="text-sm font-medium text-red-500">{discount}% OFF</span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      </article>
                    )
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => scrollFeatured(1)}
                disabled={!canScrollRight}
                aria-label="Ver próximos produtos"
                className="absolute right-0 top-[92px] z-20 flex h-11 w-11 translate-x-2 items-center justify-center text-slate-950 transition hover:scale-110 disabled:cursor-default disabled:opacity-25 disabled:hover:scale-100 sm:translate-x-7 lg:translate-x-10"
              >
                <ChevronRight className="h-7 w-7" aria-hidden="true" />
              </button>

              {pageCount > 1 ? (
                <div className="mt-4 flex items-center justify-center gap-2" aria-label="Páginas dos destaques">
                  {Array.from({ length: pageCount }, (_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => scrollToPage(index)}
                      aria-label={`Ir para página ${index + 1}`}
                      aria-current={activePage === index ? "true" : undefined}
                      className={`h-1.5 w-1.5 rounded-full transition ${
                        activePage === index ? "bg-slate-950" : "bg-slate-300 hover:bg-slate-500"
                      }`}
                    />
                  ))}
                </div>
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
