import { CheckCircle2, Loader2, Truck } from "lucide-react"
import { formatPrice } from "@/lib/checkout"
import type { PublicShippingOption } from "@/lib/server/shipping-quote"

interface ShippingOptionsProps {
  options: PublicShippingOption[]
  selected: PublicShippingOption | null
  isLoading: boolean
  error: string | null
  hasValidCep: boolean
  onSelect: (option: PublicShippingOption) => void
}

export function ShippingOptions({
  options,
  selected,
  isLoading,
  error,
  hasValidCep,
  onSelect,
}: ShippingOptionsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[#8B5CF6]">
        <Truck className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Escolha o frete</h3>
      </div>

      {!hasValidCep && (
        <p className="text-sm text-slate-500">
          Informe um CEP válido acima para consultar preço e prazo de entrega.
        </p>
      )}

      {hasValidCep && isLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-[#8B5CF6]" />
          Calculando opções de frete...
        </div>
      )}

      {error && !isLoading && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {!isLoading && options.length > 0 && (
        <div className="space-y-2" role="radiogroup" aria-label="Opções de frete">
          {options.map((option) => {
            const isSelected = selected?.serviceId === option.serviceId && selected.quoteToken === option.quoteToken
            return (
              <button
                key={`${option.serviceId}-${option.quoteToken}`}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelect(option)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  isSelected
                    ? "border-[#8B5CF6] bg-[#8B5CF6]/15"
                    : "border-white/10 bg-white/5 hover:border-[#8B5CF6]/50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{option.carrierName} · {option.serviceName}</span>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-[#8B5CF6]" />}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      Prazo estimado: {option.deliveryDays} {option.deliveryDays === 1 ? "dia útil" : "dias úteis"}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-[#8B5CF6]">
                    {formatPrice(option.priceCents / 100)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
