import { AlertCircle, CreditCard, Loader2, Lock, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/checkout"
import type { PublicShippingOption } from "@/lib/server/shipping-quote"

interface OrderSummaryProps {
  totalPrice: number
  selectedShipping: PublicShippingOption | null
  isQuoting: boolean
  isSubmitting: boolean
  checkoutError: string | null
  whatsappFallbackUrl: string | null
  onCheckout: () => void
}

export function OrderSummary({
  totalPrice,
  selectedShipping,
  isQuoting,
  isSubmitting,
  checkoutError,
  whatsappFallbackUrl,
  onCheckout,
}: OrderSummaryProps) {
  const shippingPrice = selectedShipping ? selectedShipping.priceCents / 100 : 0
  const finalTotal = totalPrice + shippingPrice
  const paymentDisabled = isSubmitting || isQuoting || !selectedShipping

  return (
    <div className="space-y-4 pt-5">
      <div className="space-y-2 border-y border-slate-200 py-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-600">Subtotal</span>
          <span className="font-medium text-slate-950">{formatPrice(totalPrice)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-600">Frete</span>
          <span className="font-medium text-slate-950">
            {selectedShipping ? formatPrice(shippingPrice) : isQuoting ? "Calculando..." : "Selecione"}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <span className="text-base font-semibold text-slate-950">Total</span>
          <span className="text-xl font-semibold text-slate-950">{formatPrice(finalTotal)}</span>
        </div>
      </div>

      <Button
        onClick={onCheckout}
        disabled={paymentDisabled}
        className="h-12 w-full rounded-lg bg-black text-base font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        type="button"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Preparando pagamento...
          </>
        ) : isQuoting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Calculando frete...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-5 w-5" />
            {selectedShipping ? "Continuar para pagamento" : "Escolha o frete para continuar"}
          </>
        )}
      </Button>

      {checkoutError ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm leading-relaxed">{checkoutError}</p>
        </div>
      ) : null}

      {whatsappFallbackUrl ? (
        <Button
          asChild
          variant="outline"
          className="h-11 w-full border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950"
        >
          <a href={whatsappFallbackUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" />
            Prefiro continuar pelo WhatsApp
          </a>
        </Button>
      ) : null}

      <div className="flex items-start justify-center gap-2 text-slate-500">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-center text-xs leading-relaxed">
          Pix e cartão são processados no ambiente seguro do Mercado Pago. O site não recebe número do cartão nem CVV.
        </p>
      </div>
    </div>
  )
}
