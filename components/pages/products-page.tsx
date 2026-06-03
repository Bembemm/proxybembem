"use client"

import { useState } from "react"
import Image from "next/image"
import { ShoppingCart, Filter, ChevronDown, Check, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useCart, type Product } from "@/contexts/cart-context"
import { ProductDetailModal } from "@/components/product-detail-modal"

const allProducts: Product[] = [
  {
    id: 1,
    title: "Deck Commander Proxy 100 Cartas",
    image: "/products/deck-commander.png",
    originalPrice: 150.00,
    discountPrice: 119.90,
    tag: "Mais Vendido",
    category: "Decks",
    colors: ["Azul", "Preto"]
  },
  {
    id: 2,
    title: "Deck Modern Burn Completo",
    image: "/products/deck-modern.png",
    originalPrice: 180.00,
    discountPrice: 149.90,
    tag: "Novo",
    category: "Decks",
    colors: ["Vermelho"]
  },
  {
    id: 3,
    title: "Pack 50 Lands Básicas Premium",
    image: "/products/lands-pack.png",
    originalPrice: 80.00,
    discountPrice: 59.90,
    tag: null,
    category: "Acessórios",
    colors: ["Branco", "Verde", "Azul", "Preto", "Vermelho"]
  },
  {
    id: 4,
    title: "Deck Pauper Mono Blue",
    image: "/products/deck-pauper.png",
    originalPrice: 90.00,
    discountPrice: 69.90,
    tag: "Popular",
    category: "Decks",
    colors: ["Azul"]
  },
  {
    id: 5,
    title: "Deck Legacy Reanimator",
    image: "/products/deck-legacy.png",
    originalPrice: 250.00,
    discountPrice: 199.90,
    tag: null,
    category: "Decks",
    colors: ["Preto", "Azul"]
  },
  {
    id: 6,
    title: "Kit Tokens Diversos 30 Cartas",
    image: "/products/tokens-kit.png",
    originalPrice: 45.00,
    discountPrice: 34.90,
    tag: "Oferta",
    category: "Acessórios",
    colors: ["Branco", "Verde"]
  },
  {
    id: 7,
    title: "Singles - Black Lotus Proxy",
    image: "/products/deck-commander.png",
    originalPrice: 25.00,
    discountPrice: 19.90,
    tag: null,
    category: "Singles",
    colors: []
  },
  {
    id: 8,
    title: "Deck Standard Mono Verde",
    image: "/products/deck-modern.png",
    originalPrice: 120.00,
    discountPrice: 99.90,
    tag: "Novo",
    category: "Decks",
    colors: ["Verde"]
  },
  {
    id: 9,
    title: "Combo Mesao - 5 Decks Variados",
    image: "/products/deck-legacy.png",
    originalPrice: 600.00,
    discountPrice: 449.90,
    tag: "Oferta",
    category: "Combos",
    colors: ["Branco", "Turquesa", "Azul", "Preto", "Vermelho", "Verde"]
  },
]

const categories = ["Decks", "Singles", "Acessórios", "Combos"]

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function AddToCartButton({ product }: { product: Product }) {
  const { addToCart, items } = useCart()
  const [justAdded, setJustAdded] = useState(false)
  
  const itemInCart = items.find(item => item.product.id === product.id)
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    addToCart(product)
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 1500)
  }

  return (
    <Button 
      onClick={handleClick}
      size="sm" 
      className={`w-full tracking-wide text-[10px] sm:text-xs py-2 transition-all duration-300 ${
        justAdded 
          ? "bg-green-500 border-green-500 text-white hover:bg-green-600" 
          : "bg-transparent border border-[#8B5CF6] text-[#8B5CF6] hover:bg-[#8B5CF6] hover:text-white hover:border-[#8B5CF6]"
      }`}
    >
      {justAdded ? (
        <>
          <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
          Adicionado!
        </>
      ) : (
        <>
          <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
          {itemInCart ? `No Carrinho (${itemInCart.quantity})` : "Adicionar"}
        </>
      )}
    </Button>
  )
}

export function ProductsPage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
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

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  const filteredProducts = allProducts.filter(product => {
    return selectedCategories.length === 0 || selectedCategories.includes(product.category)
  })

  return (
    <section className="relative pt-16 sm:pt-20 pb-8 sm:pb-12 min-h-screen">
      <div className="container mx-auto px-3 sm:px-4 relative z-10">
        {/* Mobile filter toggle */}
        <div className="lg:hidden mb-3 sm:mb-4">
          <Button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full bg-transparent border border-[#8B5CF6] text-[#8B5CF6] hover:bg-[#8B5CF6] hover:text-white hover:border-[#8B5CF6] transition-colors duration-300 py-2.5 text-sm"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtros
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          {/* Sidebar - Filters */}
          <aside className={`lg:w-56 xl:w-64 shrink-0 ${showFilters ? "block" : "hidden lg:block"}`}>
            <div className="bg-white/60 backdrop-blur-md border border-white/50 shadow-lg p-4 sm:p-5 lg:sticky lg:top-20 rounded-lg">
              <h2 className="font-[family-name:var(--font-display)] text-base sm:text-lg text-slate-900 mb-3 sm:mb-4 tracking-wide">
                Filtros
              </h2>
              
              {/* Categories */}
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-900 mb-2 sm:mb-3 uppercase tracking-wider">
                  Categorias
                </h3>
                <div className="space-y-2">
                  {categories.map((category) => (
                    <div key={category} className="flex items-center space-x-2">
                      <Checkbox
                        id={`cat-${category}`}
                        checked={selectedCategories.includes(category)}
                        onCheckedChange={() => toggleCategory(category)}
                        className="border-slate-400 data-[state=checked]:bg-[#8B5CF6] data-[state=checked]:border-[#8B5CF6]"
                      />
                      <Label
                        htmlFor={`cat-${category}`}
                        className="text-sm text-slate-700 cursor-pointer hover:text-slate-900 transition-colors"
                      >
                        {category}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Product count */}
            <div className="mb-4 sm:mb-6">
              <p className="text-xs sm:text-sm text-slate-700">
                {filteredProducts.length} produto{filteredProducts.length !== 1 ? "s" : ""} encontrado{filteredProducts.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Products Grid - Mobile Optimized */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              {filteredProducts.map((product, index) => (
                <article 
                  key={product.id} 
                  className="group relative bg-white/60 backdrop-blur-md border border-white/50 shadow-lg overflow-hidden rounded-lg hover:shadow-xl hover:border-[#8B5CF6]/50 transition-all duration-300 animate-fade-in-up"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div 
                    className="relative aspect-[4/3] bg-slate-100 overflow-hidden cursor-pointer"
                    onClick={() => openProductModal(product)}
                  >
                    <Image
                      src={product.image}
                      alt={product.title}
                      fill
                      loading="lazy"
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
                      <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 bg-[#8B5CF6] text-white text-[9px] sm:text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 tracking-wider uppercase rounded">
                        {product.tag}
                      </span>
                    )}
                  </div>
                  
                  <div className="p-2 sm:p-3 relative">
                    <h3 className="font-semibold text-slate-900 text-xs sm:text-sm mb-1.5 sm:mb-2 line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] leading-snug">
                      {product.title}
                    </h3>
                    
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2 mb-2 sm:mb-3">
                      <span className="text-[10px] sm:text-xs text-slate-500 line-through opacity-70">
                        {formatPrice(product.originalPrice)}
                      </span>
                      <span className="text-sm sm:text-base font-bold text-[#8B5CF6]">
                        {formatPrice(product.discountPrice)}
                      </span>
                    </div>
                    
                    <div className="space-y-1.5">
                      <AddToCartButton product={product} />
                      <Button 
                        onClick={() => openProductModal(product)}
                        variant="ghost"
                        size="sm" 
                        className="w-full text-[10px] sm:text-xs py-1.5 text-slate-500 hover:text-[#8B5CF6] hover:bg-[#8B5CF6]/5"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Ver Detalhes
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {filteredProducts.length === 0 && (
              <div className="bg-white/60 backdrop-blur-md border border-white/50 shadow-lg p-8 sm:p-12 text-center rounded-lg">
                <p className="text-slate-700 text-sm sm:text-base">
                  Nenhum produto encontrado com os filtros selecionados.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          isOpen={isModalOpen}
          onClose={closeProductModal}
        />
      )}
    </section>
  )
}
