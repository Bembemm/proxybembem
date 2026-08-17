import { MapPin, User } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCep, type CheckoutData, type CheckoutErrors } from "@/lib/checkout"

interface CheckoutFormProps {
  data: CheckoutData
  errors: CheckoutErrors
  onChange: (field: keyof CheckoutData, value: string) => void
}

export function CheckoutForm({ data, errors, onChange }: CheckoutFormProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-[#8B5CF6]">
        <User className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Dados para iniciar o pedido</h3>
      </div>

      <div>
        <Label htmlFor="checkout-nome" className="text-slate-400 text-sm font-medium">
          Nome *
        </Label>
        <Input
          id="checkout-nome"
          autoComplete="name"
          value={data.nome}
          onChange={(event) => onChange("nome", event.target.value)}
          placeholder="Seu nome"
          aria-invalid={Boolean(errors.nome)}
          aria-describedby={errors.nome ? "checkout-nome-error" : undefined}
          className={`mt-1.5 h-12 text-base bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] rounded-lg ${errors.nome ? "border-red-400/70 focus:border-red-400" : ""}`}
        />
        {errors.nome && (
          <p id="checkout-nome-error" className="text-red-400/80 text-sm mt-1">
            {errors.nome}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="checkout-cep" className="text-slate-400 text-sm font-medium">
          CEP para cálculo do frete *
        </Label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <Input
            id="checkout-cep"
            autoComplete="postal-code"
            inputMode="numeric"
            value={data.cep}
            onChange={(event) => onChange("cep", formatCep(event.target.value))}
            placeholder="00000-000"
            aria-invalid={Boolean(errors.cep)}
            aria-describedby={errors.cep ? "checkout-cep-error" : "checkout-cep-help"}
            className={`mt-1.5 h-12 pl-10 text-base bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] rounded-lg ${errors.cep ? "border-red-400/70 focus:border-red-400" : ""}`}
          />
        </div>
        {errors.cep ? (
          <p id="checkout-cep-error" className="text-red-400/80 text-sm mt-1">
            {errors.cep}
          </p>
        ) : (
          <p id="checkout-cep-help" className="text-slate-500 text-sm mt-1">
            O endereço completo será solicitado somente no atendimento, se necessário.
          </p>
        )}
      </div>
    </div>
  )
}
