import Image from "next/image"
import { Minus, Plus, Trash2 } from "lucide-react"
import type { CartItem } from "@/contexts/cart-context"
import { formatPrice } from "@/lib/checkout"

interface CartItemsProps {
  items: CartItem[]
  onUpdateQuantity: (productId: number, quantity: number) => void
  onRemove: (productId: number) => void
}

export function CartItems({ items, onUpdateQuantity, onRemove }: CartItemsProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.product.id}
          className="flex gap-4 bg-white/5 border border-white/10 rounded-xl p-4"
        >
          <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0">
            <Image
              src={item.product.image}
              alt={item.product.title}
              fill
              sizes="64px"
              className="object-cover"
            />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-white line-clamp-2 mb-1">
              {item.product.title}
            </h3>
            <p className="text-[#8B5CF6] font-bold text-lg">
              {formatPrice(item.product.discountPrice)}
            </p>

            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors active:scale-95"
                type="button"
                aria-label={`Diminuir quantidade de ${item.product.title}`}
              >
                <Minus className="w-4 h-4 text-slate-400" />
              </button>

              <span className="text-white text-lg font-medium w-8 text-center" aria-label={`Quantidade: ${item.quantity}`}>
                {item.quantity}
              </span>

              <button
                onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors active:scale-95"
                type="button"
                aria-label={`Aumentar quantidade de ${item.product.title}`}
              >
                <Plus className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => onRemove(item.product.id)}
                className="p-2 hover:bg-red-500/20 rounded-lg transition-colors ml-auto active:scale-95"
                type="button"
                aria-label={`Remover ${item.product.title} do carrinho`}
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
