"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Eye } from "lucide-react"
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
  featuredProducts,
  unavailable = false,
  productionLeadTimeBusinessDays,
}: {
  featuredProducts: Product[]
  unavailable?: boolean
  productionLeadTimeBusinessDays: number
}) {
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const openProductModal = (product: Product) => {
    setSelectedProduct(product)
    setIsModalOpen(true)
  }

  const closeProductModal = () => {
    setIsModalOpen(false)
    setSelectedProduct(null)
  }

  const scrollFeatured = (direction: -1 | 1) => {
    const carousel = carouselRef.current
    if (!carousel) return

    carousel.scrollBy({
      left: direction * Math.max(carousel.clientWidth * 0.82, 280),
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

          {!unavailable && featuredProducts.length === 0 ? (
            <div className="border border-slate-200 bg-slate-50 px-5 py-8 text-center">
              <p className="text-base text-slate-600">Nenhum produto em destaque no momento.</p>
            </div>
          ) : null}

          {!unavailable && featuredProducts.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => scrollFeatured(-1)}
                aria-label="Ver produtos anteriores"
                className="absolute left-0 top-[36%] z-20 flex h-10 w-10 -translate-x-1/3 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-sm ring-1 ring-slate-200 transition hover:scale-105 hover:bg-white sm:-translate-x-1/2"
              >
                <ChevronLeft className="h-6 w-6" aria-hidden="true" />
              </button>

              <div
                ref={carouselRef}
                aria-label="Produtos em destaque"
                className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-8 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-5 sm:px-7"
              >
                {featuredProducts.map((product) => {
                  const discount = discountPercent(product)

                  return (
                    <article
                      key={product.id}
                      className="group w-[78%] max-w-[220px] shrink-0 snap-start sm:w-[44%] md:w-[31%] lg:w-[23%] xl:w-[calc((100%-6.25rem)/6)] xl:max-w-none"
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
                            sizes="(max-width: 640px) 78vw, (max-width: 768px) 44vw, (max-width: 1024px) 31vw, (max-width: 1280px) 23vw, 210px"
                            className="object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                          />

                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
                            <span className="flex translate-y-1 items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-900 opacity-0 shadow-sm transition-all group-hover:translate-y-0 group-hover:opacity-100">
                              <Eye className="h-3.5 w-3.5" />
                              Ver detalhes
                            </span>
                          </span>
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

              <button
                type="button"
                onClick={() => scrollFeatured(1)}
                aria-label="Ver próximos produtos"
                className="absolute right-0 top-[36%] z-20 flex h-10 w-10 translate-x-1/3 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-sm ring-1 ring-slate-200 transition hover:scale-105 hover:bg-white sm:translate-x-1/2"
              >
                <ChevronRight className="h-6 w-6" aria-hidden="true" />
              </button>
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
