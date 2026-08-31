"use client"

import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/contexts/cart-context"
import { validationProduct } from "@/data/products"

export function ValidationPaymentClient() {
  const { addToCart, clearCart, setIsCartOpen } = useCart()

  const prepareValidationCart = () => {
    clearCart()
    addToCart(validationProduct)
    setIsCartOpen(true)
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-6 py-16">
      <div className="rounded-xl border border-slate-200 bg-white/80 p-6 shadow-sm sm:p-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#8B5CF6]">
          Uso temporário
        </p>
        <h1 className="text-3xl font-semibold text-slate-950">Validação de pagamento</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-700">
          Este item custa R$ 5,00 e existe somente para validar o checkout real em produção.
          O frete PAC/SEDEX continua sendo calculado normalmente.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Ao continuar, o carrinho atual será substituído para evitar misturar este teste com
          produtos reais.
        </p>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium text-slate-900">Produto de validação</span>
            <span className="text-xl font-bold text-[#8B5CF6]">R$ 5,00</span>
          </div>
        </div>

        <Button
          type="button"
          onClick={prepareValidationCart}
          className="mt-6 h-12 w-full bg-[#8B5CF6] text-base text-white hover:bg-[#7C3AED]"
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          Usar produto de validação
        </Button>
      </div>
    </main>
  )
}
