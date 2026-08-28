import { AlertCircle, CreditCard, Loader2, Lock, MessageCircle, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/checkout"

interface OrderSummaryProps {
  totalPrice: number
  isSubmitting: boolean
  checkoutError: string | null
  whatsappFallbackUrl: string
  onCheckout: () => void
}

export function OrderSummary({
  totalPrice,
  isSubmitting,
  checkoutError,
  whatsappFallbackUrl,
  onCheckout,
}: OrderSummaryProps) {
  return (
    <div className="pt-4 pb-8 space-y-4">
      <div className="flex justify-between items-center py-4 border-t border-b border-[#8B5CF6]/20">
        <span className="text-slate-400 font-medium text-lg">Subtotal (produtos):</span>
        <span className="text-2xl font-bold text-[#8B5CF6]">{formatPrice(totalPrice)}</span>
      </div>

      <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Truck className="w-6 h-6 text-[#8B5CF6] shrink-0 mt-0.5" />
          <div>
            <p className="text-white text-lg font-semibold mb-1">Frete calculado separadamente</p>
            <p className="text-gray-400 text-base leading-relaxed">
              O pagamento abaixo cobre os produtos. O frete será calculado pelo CEP e combinado no atendimento antes do envio.
            </p>
          </div>
        </div>
      </div>

      <Button
        onClick={onCheckout}
        disabled={isSubmitting}
        className="w-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white h-14 text-lg font-semibold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-60"
        type="button"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Preparando pagamento...
          </>
        ) : (
          <>
            <CreditCard className="w-5 h-5 mr-2" />
            Finalizar com Mercado Pago
          </>
        )}
      </Button>

      {checkoutError && (
        <div
          className="flex items-start gap-2 text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed">{checkoutError}</p>
        </div>
      )}

      <Button
        asChild
        variant="outline"
        className="w-full border-slate-600 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white h-11"
      >
        <a href={whatsappFallbackUrl} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="w-4 h-4 mr-2" />
          Prefiro continuar pelo WhatsApp
        </a>
      </Button>

      <div className="flex items-start justify-center gap-2 text-slate-500/90">
        <Lock className="w-4 h-4 text-[#8B5CF6]/60 shrink-0 mt-0.5" />
        <p className="text-sm text-center leading-relaxed">
          Pix e cartão são processados no ambiente seguro do Mercado Pago. O site não recebe número do cartão nem CVV.
        </p>
      </div>
    </div>
  )
}
