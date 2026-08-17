import { AlertCircle, CheckCircle2, Lock, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/checkout"

interface OrderSummaryProps {
  totalPrice: number
  whatsappOpened: boolean
  popupBlocked: boolean
  onOpenWhatsApp: () => void
  onConfirmSent: () => void
}

export function OrderSummary({
  totalPrice,
  whatsappOpened,
  popupBlocked,
  onOpenWhatsApp,
  onConfirmSent,
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
            <p className="text-white text-lg font-semibold mb-1">Cálculo de Frete</p>
            <p className="text-gray-400 text-base leading-relaxed">
              O CEP é enviado para iniciar o cálculo. Endereço completo, CPF e outros dados de envio só serão solicitados no atendimento se forem necessários.
            </p>
          </div>
        </div>
      </div>

      <Button
        onClick={onOpenWhatsApp}
        className="w-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white h-14 text-lg font-semibold rounded-xl active:scale-[0.98] transition-transform"
        type="button"
      >
        {whatsappOpened ? "Abrir WhatsApp novamente" : "Continuar pedido no WhatsApp"}
      </Button>

      {popupBlocked && (
        <div
          className="flex items-start gap-2 text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            O navegador bloqueou a abertura do WhatsApp. Permita pop-ups para este site e tente novamente.
          </p>
        </div>
      )}

      {whatsappOpened && (
        <div className="space-y-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
          <div className="flex items-start gap-2 text-green-300">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              O WhatsApp foi aberto. O carrinho continua salvo até você confirmar que enviou a mensagem.
            </p>
          </div>
          <Button
            onClick={onConfirmSent}
            variant="outline"
            type="button"
            className="w-full border-green-400/40 bg-transparent text-green-200 hover:bg-green-500/10 hover:text-green-100"
          >
            Já enviei o pedido — limpar carrinho
          </Button>
        </div>
      )}

      <div className="flex items-start justify-center gap-2 text-slate-500/90">
        <Lock className="w-4 h-4 text-[#8B5CF6]/60 shrink-0 mt-0.5" />
        <p className="text-sm text-center leading-relaxed">
          Pagamento via Pix é combinado no atendimento. O site não coleta dados de pagamento.
        </p>
      </div>
    </div>
  )
}
