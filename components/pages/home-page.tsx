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
      className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#8B5CF6] px-2 text-xs font-semibold text-white transition hover:bg-[#7C3AED] active:scale-[0.98] sm:px-3 sm:text-sm lg:h-9 lg:text-xs"
    >
      <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden="true" />
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
      left: direction * carousel.clientWidth,
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
            <div className="relative">
              <button
                type="button"
                onClick={() => scrollFeatured(-1)}
                disabled={!canScrollLeft}
                aria-label="Ver produtos anteriores"
                className="absolute left-0 top-[67px] z-20 flex h-10 w-10 -translate-x-1 -translate-y-1/2 items-center justify-center text-slate-950 transition hover:-translate-x-2 disabled:cursor-default disabled:opacity-20 disabled:hover:-translate-x-1 md:top-[95px] md:-translate-x-6 md:disabled:hover:-translate-x-6 lg:top-[86px] lg:-translate-x-8 lg:disabled:hover:-translate-x-8"
              >
                <ArrowLeft className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
              </button>

              <div
                ref={carouselRef}
                onScroll={updateScrollState}
                aria-label="Produtos em destaque"
                className="snap-x snap-mandatory overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex w-max min-w-full justify-center gap-4">
                  {products.map((product) => {
                    const discount = discountPercent(product)

                    return (
                      <article
                        key={product.id}
                        className="group w-[min(78vw,320px)] shrink-0 snap-start md:w-[190px] lg:w-[172px]"
                      >
                        <button
                          type="button"
                          onClick={() => openProductModal(product)}
                          className="grid w-full grid-cols-[42%_1fr] items-start gap-4 text-left md:block"
                          aria-label={`Ver detalhes de ${product.title}`}
                        >
                          <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
                            <Image
                              src={product.image}
                              alt={product.title}
                              fill
                              sizes="(max-width: 767px) 33vw, (max-width: 1023px) 190px, 172px"
                              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          </div>

                          <div className="pt-0 md:pt-3">
                            <h2 className="line-clamp-3 text-base font-normal leading-[1.35] text-slate-900 md:min-h-[2.6rem] md:line-clamp-2 md:text-[15px] lg:text-sm">
                              {product.title}
                            </h2>

                            {product.originalPrice > product.discountPrice ? (
                              <p className="mt-3 text-sm text-slate-500 line-through md:mt-2 md:text-xs">
                                {formatPrice(product.originalPrice)}
                              </p>
                            ) : (
                              <div className="mt-3 h-5 md:mt-2 md:h-4" aria-hidden="true" />
                            )}

                            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 md:mt-0.5">
                              <span className="text-xl font-bold leading-tight text-slate-950 md:text-lg lg:text-base">
                                {formatPrice(product.discountPrice)}
                              </span>
                              {discount > 0 ? (
                                <span className="text-sm font-medium text-red-500 lg:text-xs">{discount}% OFF</span>
                              ) : null}
                            </div>
                          </div>
                        </button>

                        <AddToCartButton product={product} />
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
                className="absolute right-0 top-[67px] z-20 flex h-10 w-10 translate-x-1 -translate-y-1/2 items-center justify-center text-slate-950 transition hover:translate-x-2 disabled:cursor-default disabled:opacity-20 disabled:hover:translate-x-1 md:top-[95px] md:translate-x-6 md:disabled:hover:translate-x-6 lg:top-[86px] lg:translate-x-8 lg:disabled:hover:translate-x-8"
              >
                <ArrowRight className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
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
