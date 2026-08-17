"use client"

import { useState } from "react"
import Image from "next/image"
import { ShoppingCart, Check, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProductDetailModal } from "@/components/product-detail-modal"
import { useCart } from "@/contexts/cart-context"
import { featuredProducts } from "@/lib/catalog"
import { formatBRL } from "@/lib/money"
import type { PageType } from "@/app/page"
import type { Product } from "@/types/commerce"

function AddToCartButton({ product }: { product: Product }) {
  const { addToCart, items } = useCart()
  const [justAdded, setJustAdded] = useState(false)

  const itemInCart = items.find((item) => item.product.id === product.id)

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    addToCart(product)
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 1500)
  }

  return (
    <Button
      onClick={handleClick}
      size="sm"
      type="button"
      className={`w-full tracking-wide text-sm sm:text-base h-12 transition-all duration-300 active:scale-[0.98] ${
        justAdded
          ? "bg-green-500 border-green-500 text-white hover:bg-green-600"
          : "bg-transparent border border-[#8B5CF6] text-[#8B5CF6] hover:bg-[#8B5CF6] hover:text-white hover:border-[#8B5CF6]"
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

interface HomePageProps {
  setCurrentPage: (page: PageType) => void
}

export function HomePage({ setCurrentPage }: HomePageProps) {
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
      {/* Hero Section - Mobile Optimized */}
      <section className="relative flex items-center justify-center overflow-hidden pt-16 sm:pt-20 pb-2 sm:pb-4">
        <div className="relative container mx-auto px-3 sm:px-4 py-4 sm:py-6 text-center z-10">
          <div className="bg-white/60 backdrop-blur-md border border-white/50 shadow-lg p-4 sm:p-6 md:p-8 max-w-2xl mx-auto rounded-lg">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-[family-name:var(--font-display)] text-slate-900 mb-4 sm:mb-6 tracking-wide text-balance">
              Seja Bem-Vindo
            </h1>

            <div className="w-32 sm:w-48 mx-auto mb-4 sm:mb-8 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />

            <p className="text-lg sm:text-xl md:text-2xl text-slate-700 max-w-xl mx-auto leading-relaxed text-pretty px-2">
              Aqui você encontra tudo para jogar. Decks completos, cartas avulsas e proxies de alta qualidade para TCG.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Products - Mobile Optimized */}
      <section className="relative py-2 sm:py-4">
        <div className="container mx-auto px-3 sm:px-4 relative z-10">
          <div className="text-center mb-6 sm:mb-10 bg-white/60 backdrop-blur-md border border-white/50 shadow-lg p-4 sm:p-6 max-w-xl mx-auto rounded-lg">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-[family-name:var(--font-display)] text-slate-900 mb-2 sm:mb-3 tracking-wide text-balance">
              Proxies em Destaque
            </h2>

            <div className="w-16 sm:w-24 mx-auto mb-3 sm:mb-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />

            <p className="text-slate-700 text-base sm:text-lg px-2">
              Confira nossa seleção especial de decks e proxies de alta qualidade.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 max-w-4xl mx-auto">
            {featuredProducts.map((product) => (
              <article
                key={product.id}
                className="group relative bg-white/60 backdrop-blur-md border border-white/50 shadow-lg overflow-hidden rounded-lg hover:shadow-xl hover:border-[#8B5CF6]/50 transition-all duration-300 w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)] max-w-sm"
              >
                <div
                  className="relative aspect-[4/3] bg-slate-100 overflow-hidden cursor-pointer"
                  onClick={() => openProductModal(product)}
                >
                  <Image
                    src={product.image}
                    alt={product.title}
                    fill
                    loading="eager"
                    className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-transparent to-transparent opacity-60" />

                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-[#8B5CF6]/0 group-hover:bg-[#8B5CF6]/20 transition-colors duration-300 flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 text-[#8B5CF6] text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" />
                      Ver Detalhes
                    </span>
                  </div>

                  {product.tag && (
                    <span className="absolute top-2 left-2 bg-[#8B5CF6] text-white text-xs sm:text-sm font-semibold px-2.5 py-1 tracking-wider uppercase rounded">
                      {product.tag}
                    </span>
                  )}
                </div>

                <div className="p-3 sm:p-4 relative">
                  <h3 className="font-semibold text-slate-900 text-lg sm:text-xl mb-2 line-clamp-2 min-h-[3rem] leading-snug">
                    {product.title}
                  </h3>

                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-base text-slate-500 line-through opacity-70">
                      {formatBRL(product.originalPrice)}
                    </span>
                    <span className="text-xl sm:text-2xl font-bold text-[#8B5CF6]">
                      {formatBRL(product.discountPrice)}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <AddToCartButton product={product} />
                    <Button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openProductModal(product)
                      }}
                      variant="ghost"
                      size="sm"
                      type="button"
                      className="w-full text-sm h-10 text-slate-500 hover:text-[#8B5CF6] hover:bg-[#8B5CF6]/5 active:scale-[0.98]"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Ver Detalhes
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="text-center mt-6 sm:mt-8">
            <Button
              size="lg"
              onClick={() => setCurrentPage("produtos")}
              type="button"
              className="w-full sm:w-auto bg-transparent border border-[#8B5CF6] text-[#8B5CF6] px-6 sm:px-8 h-14 tracking-wide hover:bg-[#8B5CF6] hover:text-white hover:border-[#8B5CF6] transition-colors duration-300 text-base sm:text-lg active:scale-[0.98]"
            >
              Ver Todos os Produtos
            </Button>
          </div>
        </div>
      </section>

      {/* Product Detail Modal */}
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
