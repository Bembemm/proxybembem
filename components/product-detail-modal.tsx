"use client"

import { useState } from "react"
import { X, ShoppingCart, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCart, type Product } from "@/contexts/cart-context"

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

interface ProductDetailModalProps {
  product: Product
  isOpen: boolean
  onClose: () => void
}

export function ProductDetailModal({ product, isOpen, onClose }: ProductDetailModalProps) {
  const { addToCart, items } = useCart()
  const [justAdded, setJustAdded] = useState(false)
  
  const itemInCart = items.find(item => item.product.id === product.id)
  
  const handleAddToCart = () => {
    addToCart(product)
    setJustAdded(true)
    setTimeout(() => {
      setJustAdded(false)
      onClose()
    }, 800)
  }

  return (
<Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] p-0 bg-slate-900/95 backdrop-blur-xl border border-[#8B5CF6]/30 overflow-hidden rounded-xl">
        <DialogTitle className="sr-only">{product.title}</DialogTitle>
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-50 p-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 transition-colors active:scale-95"
          type="button"
        >
          <X className="w-5 h-5 text-slate-300" />
        </button>
        
        {/* Content Section */}
        <div className="p-5 md:p-6 flex flex-col">
          {/* Product Tag */}
{product.tag && (
            <span className="self-start bg-[#8B5CF6] text-white text-sm font-semibold px-3 py-1 tracking-wider uppercase rounded mb-3">
              {product.tag}
            </span>
          )}
          
          {/* Product Title */}
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            {product.title}
          </h2>
          
          {/* Price */}
          <div className="flex items-baseline gap-3 mb-5">
            <span className="text-base text-slate-400 line-through">
              {formatPrice(product.originalPrice)}
            </span>
            <span className="text-3xl font-bold text-white">
              {formatPrice(product.discountPrice)}
            </span>
          </div>
          
          {/* Description with scroll */}
          <div className="flex-1 mb-5 overflow-y-auto max-h-[280px] pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
            <div className="leading-relaxed space-y-3">
{/* Alerta de Atenção */}
              <p className="text-xl font-bold text-yellow-500 text-center">
                IMPORTANTE: LEIA ANTES DE COMPRAR
              </p>
              
              {/* Títulos das linhas */}
              <div className="space-y-2">
                <p>
                  <span className="font-bold text-white">O QUE É:</span>{" "}
                  <span className="text-base text-gray-300">Este produto são PROXIES (cartas para teste/casual). NÃO SÃO CARTAS ORIGINAIS.</span>
                </p>
                
                <p>
                  <span className="font-bold text-white">VERSO:</span>{" "}
                  <span className="text-base text-gray-300">BRANCO (Não tem arte no verso).</span>
                </p>
                
                <p>
                  <span className="font-bold text-white">SLEEVES:</span>{" "}
                  <span className="text-base text-gray-300">NÃO INCLUSOS. É necessário o uso de sleeves (protetores) com fundo colorido/opaco para jogar.</span>
                </p>
                
                <p>
                  <span className="font-bold text-white">ARTES:</span>{" "}
                  <span className="text-base text-gray-300">Trabalhamos com artes oficiais, alternativas do nosso banco de dados e também com Artes Personalizadas (fotos pessoais, logos ou desenhos próprios). Atenção: A confecção/impressão de artes próprias possui um custo adicional. Consulte os valores ao enviar sua lista no WhatsApp.</span>
                </p>
              </div>
              
              {/* Cabeçalho de Seção */}
              <p className="mt-4 font-bold text-white text-lg">O QUE ESTÁ INCLUSO</p>
              <div className="text-base text-gray-300 space-y-1">
                <p>Quantidade: 100 Cartas de Magic: The Gathering (Proxy) + Bônus surpresa!</p>
                <p>Seleção: 100% à sua escolha (Você manda a lista!). Pode ser um deck inteiro ou 100 cartas variadas.</p>
              </div>
              
              {/* Cabeçalho de Seção */}
              <p className="mt-4 font-bold text-white text-lg">COMO ENVIAR SUA LISTA</p>
              <div className="text-base text-gray-300 space-y-1">
                <p>Após finalizar o pedido no WhatsApp, envie imediatamente o link do Moxfield ou LigaMagic.</p>
                <p>Também trabalhamos com listas do MPCFill.</p>
              </div>
              
              {/* Cabeçalho de Seção */}
              <p className="mt-4 font-bold text-white text-lg">QUALIDADE PROXYBEMBEM</p>
              <p className="text-base text-gray-300">
                Impressão Direta Premium em papel fotográfico de alta gramatura. Cores vibrantes, texto nítido e corte de precisão padrão para encaixe perfeito nos sleeves.
              </p>
            </div>
          </div>
          
{/* Cart info */}
          {itemInCart && (
            <p className="text-base text-gray-300 mb-3">
              Você já tem {itemInCart.quantity} unidade{itemInCart.quantity > 1 ? "s" : ""} no carrinho
            </p>
          )}
          
          {/* Add to Cart Button */}
          <Button 
            onClick={handleAddToCart}
            size="lg"
            type="button"
            className={`w-full h-14 text-lg font-semibold tracking-wide transition-all duration-300 active:scale-[0.98] rounded-xl ${
              justAdded 
                ? "bg-green-500 hover:bg-green-600 text-white" 
                : "bg-[#8B5CF6] hover:bg-[#7C3AED] text-white"
            }`}
          >
            {justAdded ? (
              <>
                <Check className="w-5 h-5 mr-2" />
                Adicionado ao Carrinho!
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5 mr-2" />
                Adicionar ao Carrinho
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
