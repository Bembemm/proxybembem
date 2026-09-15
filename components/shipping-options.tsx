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
      <div className="flex items-center gap-2 text-slate-950">
        <Truck className="h-5 w-5" />
        <h3 className="text-base font-semibold">Opções de frete</h3>
      </div>

      {!hasValidCep ? (
        <p className="text-sm text-slate-500">
          Informe um CEP válido para consultar preço e prazo de entrega.
        </p>
      ) : null}

      {hasValidCep && isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-[#8B5CF6]" />
          Calculando opções de frete...
        </div>
      ) : null}

      {error && !isLoading ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && options.length > 0 ? (
        <div className="space-y-2" role="radiogroup" aria-label="Opções de frete">
          {options.map((option) => {
            const isSelected =
              selected?.serviceId === option.serviceId && selected.quoteToken === option.quoteToken
            return (
              <button
                key={`${option.serviceId}-${option.quoteToken}`}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelect(option)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  isSelected
                    ? "border-[#8B5CF6] bg-[#8B5CF6]/5 ring-1 ring-[#8B5CF6]/20"
                    : "border-slate-200 bg-white hover:border-slate-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-950">
                        {option.carrierName} · {option.serviceName}
                      </span>
                      {isSelected ? <CheckCircle2 className="h-4 w-4 text-[#8B5CF6]" /> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Prazo estimado: {option.deliveryDays} {option.deliveryDays === 1 ? "dia útil" : "dias úteis"}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-slate-950">
                    {formatPrice(option.priceCents / 100)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
