"use client"

import { useState } from "react"
import Image from "next/image"
import { Check, Eye, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProductDetailModal } from "@/components/product-detail-modal"
import { useCart, type Product } from "@/contexts/cart-context"
import { products } from "@/data/products"

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
  const [justAdded, setJustAdded] = useState(false)

  const itemInCart = items.find((item) => item.product.id === product.id)

  const handleClick = () => {
    addToCart(product)
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1500)
  }

  return (
    <Button
      onClick={handleClick}
      size="sm"
      type="button"
      className={`w-full tracking-wide text-sm sm:text-base h-12 transition-all duration-300 active:scale-[0.98] ${
        justAdded
          ? "bg-green-500 border-green-500 text-white hover:bg-green-600"
          : "bg-[#8B5CF6] border border-[#8B5CF6] text-white hover:bg-[#7C3AED] hover:border-[#7C3AED]"
      }`}
    >
      {justAdded ? (
        <>
          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
          Adicionado!
        </>
      ) : (
        <>
          <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
          {itemInCart ? `No Carrinho (${itemInCart.quantity})` : "Adicionar ao Carrinho"}
        </>
      )}
    </Button>
  )
}

export function HomePage() {
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

  return (
    <>
      <section className="relative flex items-center justify-center overflow-hidden pt-16 sm:pt-20 pb-3 sm:pb-6">
        <div className="relative container mx-auto px-3 sm:px-4 py-5 sm:py-8 text-center z-10">
          <div className="bg-white/60 backdrop-blur-md border border-white/50 shadow-lg p-5 sm:p-7 md:p-9 max-w-3xl mx-auto rounded-xl">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-[#8B5CF6] mb-3">
              ProxyBembem
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-[family-name:var(--font-display)] text-slate-900 mb-4 sm:mb-6 tracking-wide text-balance">
              Monte seu deck do seu jeito
            </h1>

            <div className="w-32 sm:w-48 mx-auto mb-4 sm:mb-6 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />

            <p className="text-lg sm:text-xl md:text-2xl text-slate-700 max-w-2xl mx-auto leading-relaxed text-pretty px-2 mb-5 sm:mb-7">
              Escolha a quantidade de cartas, envie sua lista e receba proxies de alta qualidade prontas para jogar.
            </p>
          </div>
        </div>
      </section>

      <section id="produtos" className="relative py-5 sm:py-9 scroll-mt-20">
        <div className="container mx-auto px-3 sm:px-4 relative z-10">
          <div className="text-center mb-6 sm:mb-9 max-w-2xl mx-auto">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-[#8B5CF6] mb-2">
              Catálogo completo
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-[family-name:var(--font-display)] text-slate-900 mb-3 tracking-wide text-balance">
              Escolha seu deck
            </h2>
            <p className="text-slate-700 text-base sm:text-lg px-2">
              Todos os produtos estão aqui. Veja os detalhes, escolha o tamanho ideal e adicione direto ao carrinho.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-5xl mx-auto">
            {products.map((product) => {
              const discount = discountPercent(product)

              return (
                <article
                  key={product.id}
                  className="group relative bg-white/65 backdrop-blur-md border border-white/60 shadow-lg overflow-hidden rounded-xl hover:shadow-2xl hover:border-[#8B5CF6]/50 hover:-translate-y-1 transition-all duration-300"
                >
                  <button
                    type="button"
                    className="relative aspect-[16/10] w-full bg-slate-100 overflow-hidden cursor-pointer text-left"
                    onClick={() => openProductModal(product)}
                    aria-label={`Ver detalhes de ${product.title}`}
                  >
                    <Image
                      src={product.image}
                      alt={product.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    />

                    <span className="absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" />

                    <span className="absolute inset-0 bg-[#8B5CF6]/0 group-hover:bg-[#8B5CF6]/15 transition-colors duration-300 flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 bg-white/95 text-[#8B5CF6] text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 shadow-lg">
                        <Eye className="w-4 h-4" />
                        Ver detalhes
                      </span>
                    </span>

                    <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
                      {product.tag ? (
                        <span className="bg-[#8B5CF6] text-white text-xs sm:text-sm font-semibold px-3 py-1.5 tracking-wider uppercase rounded-full shadow">
                          {product.tag}
                        </span>
                      ) : (
                        <span />
                      )}

                      {discount > 0 && (
                        <span className="bg-white/95 text-[#7C3AED] text-xs sm:text-sm font-bold px-3 py-1.5 rounded-full shadow">
                          -{discount}%
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">
                          {product.category}
                        </p>
                        <h3 className="font-semibold text-slate-900 text-xl sm:text-2xl leading-snug">
                          {product.title}
                        </h3>
                      </div>
                    </div>

                    <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-4 line-clamp-2">
                      {product.description}
                    </p>

                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
                      <span className="text-sm sm:text-base text-slate-500 line-through opacity-75">
                        {formatPrice(product.originalPrice)}
                      </span>
                      <span className="text-2xl sm:text-3xl font-bold text-[#8B5CF6]">
                        {formatPrice(product.discountPrice)}
                      </span>
                      {product.originalPrice > product.discountPrice && (
                        <span className="text-xs sm:text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                          Economize {formatPrice(product.originalPrice - product.discountPrice)}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                      <AddToCartButton product={product} />
                      <Button
                        onClick={() => openProductModal(product)}
                        variant="outline"
                        size="sm"
                        type="button"
                        className="h-12 px-4 border-[#8B5CF6]/30 text-[#8B5CF6] hover:bg-[#8B5CF6]/10 hover:text-[#7C3AED] active:scale-[0.98]"
                      >
                        <Eye className="w-4 h-4 mr-1.5" />
                        Detalhes
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          isOpen={isModalOpen}
          onClose={closeProductModal}
        />
      )}
    </>
  )
}
