import Image from "next/image"
import { Minus, Plus } from "lucide-react"
import type { CartItem } from "@/contexts/cart-context"
import { formatPrice } from "@/lib/checkout"

interface CartItemsProps {
  items: CartItem[]
  onUpdateQuantity: (productId: number, quantity: number) => void
  onRemove: (productId: number) => void
}

export function CartItems({ items, onUpdateQuantity, onRemove }: CartItemsProps) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.product.id} className="flex gap-4 border-b border-slate-200 pb-4 last:border-0 last:pb-0">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            <Image
              src={item.product.image}
              unoptimized={item.product.image.startsWith("/")}
              alt={item.product.title}
              fill
              sizes="80px"
              className="object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="line-clamp-2 text-sm font-medium leading-snug text-slate-950">
                {item.product.title}
              </h3>
              <button
                onClick={() => onRemove(item.product.id)}
                className="shrink-0 text-xs text-slate-700 underline underline-offset-2 hover:text-red-600"
                type="button"
                aria-label={`Remover ${item.product.title} do carrinho`}
              >
                Remover
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="inline-flex items-center overflow-hidden rounded-md border border-slate-300 bg-white">
                <button
                  onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                  className="flex h-9 w-9 items-center justify-center text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
                  type="button"
                  aria-label={`Diminuir quantidade de ${item.product.title}`}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="flex h-9 min-w-9 items-center justify-center border-x border-slate-300 px-2 text-sm text-slate-950" aria-label={`Quantidade: ${item.quantity}`}>
                  {item.quantity}
                </span>
                <button
                  onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                  className="flex h-9 w-9 items-center justify-center text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
                  type="button"
                  aria-label={`Aumentar quantidade de ${item.product.title}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <p className="text-base font-medium text-slate-950">
                {formatPrice(item.product.discountPrice * item.quantity)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
