"use client"

import { useState } from "react"
import { ChevronDown, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ProductDetailModal } from "@/components/product-detail-modal"
import { StorefrontProductCard } from "@/components/storefront-product-card"
import type { Product } from "@/contexts/cart-context"

export function ProductsPage({
  products,
  unavailable = false,
  productionLeadTimeBusinessDays,
  initialCategory,
}: {
  products: Product[]
  unavailable?: boolean
  productionLeadTimeBusinessDays: number
  initialCategory?: string
}) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialCategory ? [initialCategory] : [],
  )
  const [showFilters, setShowFilters] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const categories = Array.from(new Set(products.map((product) => product.category)))

  const openProductModal = (product: Product) => {
    setSelectedProduct(product)
    setIsModalOpen(true)
  }

  const closeProductModal = () => {
    setIsModalOpen(false)
    setSelectedProduct(null)
  }

  const toggleCategory = (category: string) => {
    setSelectedCategories((previousCategories) =>
      previousCategories.includes(category)
        ? previousCategories.filter((item) => item !== category)
        : [...previousCategories, category],
    )
  }

  const filteredProducts = products.filter(
    (product) =>
      selectedCategories.length === 0 || selectedCategories.includes(product.category),
  )

  return (
    <section className="relative pb-8 pt-16 sm:pb-12 sm:pt-20">
      <div className="container relative z-10 mx-auto px-3 sm:px-4">
        <div className="mb-3 sm:mb-4 lg:hidden">
          <Button
            onClick={() => setShowFilters((current) => !current)}
            type="button"
            aria-expanded={showFilters}
            aria-controls="product-filters"
            className="h-12 w-full border border-[#8B5CF6] bg-transparent text-base text-[#8B5CF6] transition-colors duration-300 active:scale-[0.98] hover:border-[#8B5CF6] hover:bg-[#8B5CF6] hover:text-white"
          >
            <Filter className="mr-2 h-4 w-4" />
            Filtros
            <ChevronDown
              className={`ml-auto h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
            />
          </Button>
        </div>

        <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row">
          <aside
            id="product-filters"
            className={`shrink-0 lg:w-56 xl:w-64 ${showFilters ? "block" : "hidden lg:block"}`}
          >
            <div className="rounded-lg border border-white/50 bg-white/60 p-4 shadow-lg backdrop-blur-md sm:p-5 lg:sticky lg:top-20">
              <h2 className="mb-3 text-lg tracking-wide text-slate-900 font-[family-name:var(--font-display)] sm:mb-4 sm:text-xl">
                Filtros
              </h2>

              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-900 sm:mb-3 sm:text-base">
                  Categorias
                </h3>
                <div className="space-y-2">
                  {categories.map((category) => (
                    <div key={category} className="flex items-center space-x-2">
                      <Checkbox
                        id={`cat-${category}`}
                        checked={selectedCategories.includes(category)}
                        onCheckedChange={() => toggleCategory(category)}
                        className="border-slate-400 data-[state=checked]:border-[#8B5CF6] data-[state=checked]:bg-[#8B5CF6]"
                      />
                      <Label
                        htmlFor={`cat-${category}`}
                        className="cursor-pointer text-base text-slate-700 transition-colors hover:text-slate-900"
                      >
                        {category}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {unavailable ? (
              <div
                className="mb-4 rounded-lg border border-white/50 bg-white/60 p-6 text-center shadow-lg backdrop-blur-md sm:mb-6 sm:p-8"
                role="status"
              >
                <p className="text-base font-medium text-slate-700 sm:text-lg">
                  Catálogo temporariamente indisponível.
                </p>
                <p className="mt-2 text-sm text-slate-500 sm:text-base">
                  Tente novamente em alguns instantes.
                </p>
              </div>
            ) : null}

            <div className="mb-4 sm:mb-6" aria-live="polite">
              <p className="text-sm text-slate-700 sm:text-base">
                {filteredProducts.length} produto{filteredProducts.length !== 1 ? "s" : ""} encontrado
                {filteredProducts.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <StorefrontProductCard
                  key={product.id}
                  product={product}
                  onViewDetails={openProductModal}
                  className="animate-fade-in-up"
                />
              ))}
            </div>

            {!unavailable && filteredProducts.length === 0 ? (
              <div className="rounded-lg border border-white/50 bg-white/60 p-8 text-center shadow-lg backdrop-blur-md sm:p-12">
                <p className="text-base text-slate-700 sm:text-lg">
                  Nenhum produto encontrado com os filtros selecionados.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {selectedProduct ? (
        <ProductDetailModal
          product={selectedProduct}
          isOpen={isModalOpen}
          onClose={closeProductModal}
          productionLeadTimeBusinessDays={productionLeadTimeBusinessDays}
        />
      ) : null}
    </section>
  )
}
