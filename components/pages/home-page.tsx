"use client"

import { useState } from "react"
import Image from "next/image"
import { Check, Eye, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
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
      className={`h-10 w-full text-sm transition-all duration-200 active:scale-[0.98] ${
        justAdded
          ? "border-green-500 bg-green-500 text-white hover:bg-green-600"
          : "border border-slate-900 bg-slate-900 text-white hover:bg-[#8B5CF6] hover:border-[#8B5CF6]"
      }`}
    >
      {justAdded ? (
        <>
          <Check className="mr-1.5 h-3.5 w-3.5" />
          Adicionado
        </>
      ) : (
        <>
          <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
          {itemInCart ? `No carrinho (${itemInCart.quantity})` : "Adicionar"}
        </>
      )}
    </Button>
  )
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
      <section className="min-h-[70vh] bg-white pb-10 pt-20 sm:pb-14 sm:pt-24">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="mb-5 border-b border-slate-200 pb-3 sm:mb-7 sm:pb-4">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Destaques
            </h1>
          </div>

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

          <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 xl:grid-cols-6">
            {featuredProducts.map((product) => {
              const discount = discountPercent(product)

              return (
                <article key={product.id} className="group min-w-0">
                  <button
                    type="button"
                    onClick={() => openProductModal(product)}
                    className="block w-full text-left"
                    aria-label={`Ver detalhes de ${product.title}`}
                  >
                    <div className="relative aspect-square overflow-hidden bg-slate-100">
                      <Image
                        src={product.image}
                        alt={product.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 16vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 transition-colors group-hover:bg-slate-950/15">
                        <span className="flex translate-y-1 items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 opacity-0 shadow-sm transition-all group-hover:translate-y-0 group-hover:opacity-100">
                          <Eye className="h-3.5 w-3.5" />
                          Ver detalhes
                        </span>
                      </span>
                    </div>

                    <div className="pt-3">
                      <p className="mb-1 truncate text-xs text-slate-500">{product.category}</p>
                      <h2 className="min-h-[2.5rem] text-sm font-medium leading-5 text-slate-900 line-clamp-2 sm:text-[15px]">
                        {product.title}
                      </h2>

                      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {product.originalPrice > product.discountPrice ? (
                          <span className="text-xs text-slate-400 line-through">
                            {formatPrice(product.originalPrice)}
                          </span>
                        ) : null}
                        {discount > 0 ? (
                          <span className="text-xs font-medium text-red-500">{discount}% OFF</span>
                        ) : null}
                      </div>

                      <p className="mt-0.5 text-lg font-bold leading-tight text-slate-950">
                        {formatPrice(product.discountPrice)}
                      </p>
                    </div>
                  </button>

                  <div className="mt-3">
                    <AddToCartButton product={product} />
                  </div>
                </article>
              )
            })}
          </div>
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
