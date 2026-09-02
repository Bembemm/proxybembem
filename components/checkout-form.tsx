import { Mail, MapPin, MessageCircle, User } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  formatCep,
  formatWhatsapp,
  type CheckoutData,
  type CheckoutErrors,
} from "@/lib/checkout"

interface CheckoutFormProps {
  data: CheckoutData
  errors: CheckoutErrors
  onChange: (field: keyof CheckoutData, value: string) => void
}

function errorText(id: string, message?: string) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-sm text-red-400/80">
      {message}
    </p>
  )
}

export function CheckoutForm({ data, errors, onChange }: CheckoutFormProps) {
  const inputClass =
    "mt-1.5 h-12 text-base bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] rounded-lg"

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-[#8B5CF6]">
        <User className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Dados para finalizar a compra</h3>
      </div>

      <div>
        <Label htmlFor="checkout-nome" className="text-slate-400 text-sm font-medium">
          Nome *
        </Label>
        <Input
          id="checkout-nome"
          autoComplete="name"
          maxLength={100}
          value={data.nome}
          onChange={(event) => onChange("nome", event.target.value)}
          placeholder="Seu nome"
          aria-invalid={Boolean(errors.nome)}
          aria-describedby={errors.nome ? "checkout-nome-error" : undefined}
          className={`${inputClass} ${errors.nome ? "border-red-400/70 focus:border-red-400" : ""}`}
        />
        {errorText("checkout-nome-error", errors.nome)}
      </div>

      <div>
        <Label htmlFor="checkout-email" className="text-slate-400 text-sm font-medium">
          E-mail *
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <Input
            id="checkout-email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={data.email}
            onChange={(event) => onChange("email", event.target.value)}
            placeholder="voce@exemplo.com"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "checkout-email-error" : "checkout-email-help"}
            className={`${inputClass} pl-10 ${errors.email ? "border-red-400/70 focus:border-red-400" : ""}`}
          />
        </div>
        {errors.email ? (
          errorText("checkout-email-error", errors.email)
        ) : (
          <p id="checkout-email-help" className="text-slate-500 text-sm mt-1">
            Usaremos este e-mail para identificar seu pedido e sua conta, caso você crie uma.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="checkout-whatsapp" className="text-slate-400 text-sm font-medium">
          WhatsApp com DDD *
        </Label>
        <div className="relative">
          <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <Input
            id="checkout-whatsapp"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={data.whatsapp}
            onChange={(event) => onChange("whatsapp", formatWhatsapp(event.target.value))}
            placeholder="(44) 99999-9999"
            aria-invalid={Boolean(errors.whatsapp)}
            aria-describedby={errors.whatsapp ? "checkout-whatsapp-error" : "checkout-whatsapp-help"}
            className={`${inputClass} pl-10 ${errors.whatsapp ? "border-red-400/70 focus:border-red-400" : ""}`}
          />
        </div>
        {errors.whatsapp ? (
          errorText("checkout-whatsapp-error", errors.whatsapp)
        ) : (
          <p id="checkout-whatsapp-help" className="text-slate-500 text-sm mt-1">
            Usaremos este número caso seja necessário falar sobre o pedido ou a entrega.
          </p>
        )}
      </div>

      <div className="pt-1">
        <div className="flex items-center gap-2 text-[#8B5CF6] mb-3">
          <MapPin className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Endereço de entrega</h3>
        </div>

        <div>
          <Label htmlFor="checkout-cep" className="text-slate-400 text-sm font-medium">
            CEP *
          </Label>
          <Input
            id="checkout-cep"
            autoComplete="postal-code"
            inputMode="numeric"
            value={data.cep}
            onChange={(event) => onChange("cep", formatCep(event.target.value))}
            placeholder="00000-000"
            aria-invalid={Boolean(errors.cep)}
            aria-describedby={errors.cep ? "checkout-cep-error" : "checkout-cep-help"}
            className={`${inputClass} ${errors.cep ? "border-red-400/70 focus:border-red-400" : ""}`}
          />
          {errors.cep ? (
            errorText("checkout-cep-error", errors.cep)
          ) : (
            <p id="checkout-cep-help" className="text-slate-500 text-sm mt-1">
              O CEP é usado para consultar preço e prazo do frete antes do pagamento.
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_110px]">
          <div>
            <Label htmlFor="checkout-rua" className="text-slate-400 text-sm font-medium">
              Rua / Avenida *
            </Label>
            <Input
              id="checkout-rua"
              autoComplete="street-address"
              maxLength={120}
              value={data.rua}
              onChange={(event) => onChange("rua", event.target.value)}
              placeholder="Nome da rua"
              aria-invalid={Boolean(errors.rua)}
              aria-describedby={errors.rua ? "checkout-rua-error" : undefined}
              className={`${inputClass} ${errors.rua ? "border-red-400/70 focus:border-red-400" : ""}`}
            />
            {errorText("checkout-rua-error", errors.rua)}
          </div>

          <div>
            <Label htmlFor="checkout-numero" className="text-slate-400 text-sm font-medium">
              Número *
            </Label>
            <Input
              id="checkout-numero"
              maxLength={20}
              value={data.numero}
              onChange={(event) => onChange("numero", event.target.value)}
              placeholder="123"
              aria-invalid={Boolean(errors.numero)}
              aria-describedby={errors.numero ? "checkout-numero-error" : undefined}
              className={`${inputClass} ${errors.numero ? "border-red-400/70 focus:border-red-400" : ""}`}
            />
            {errorText("checkout-numero-error", errors.numero)}
          </div>
        </div>

        <div className="mt-4">
          <Label htmlFor="checkout-complemento" className="text-slate-400 text-sm font-medium">
            Complemento
          </Label>
          <Input
            id="checkout-complemento"
            autoComplete="address-line2"
            maxLength={80}
            value={data.complemento}
            onChange={(event) => onChange("complemento", event.target.value)}
            placeholder="Apto, bloco, referência..."
            aria-invalid={Boolean(errors.complemento)}
            aria-describedby={errors.complemento ? "checkout-complemento-error" : undefined}
            className={`${inputClass} ${errors.complemento ? "border-red-400/70 focus:border-red-400" : ""}`}
          />
          {errorText("checkout-complemento-error", errors.complemento)}
        </div>

        <div className="mt-4">
          <Label htmlFor="checkout-bairro" className="text-slate-400 text-sm font-medium">
            Bairro *
          </Label>
          <Input
            id="checkout-bairro"
            autoComplete="address-level3"
            maxLength={80}
            value={data.bairro}
            onChange={(event) => onChange("bairro", event.target.value)}
            placeholder="Bairro"
            aria-invalid={Boolean(errors.bairro)}
            aria-describedby={errors.bairro ? "checkout-bairro-error" : undefined}
            className={`${inputClass} ${errors.bairro ? "border-red-400/70 focus:border-red-400" : ""}`}
          />
          {errorText("checkout-bairro-error", errors.bairro)}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_90px]">
          <div>
            <Label htmlFor="checkout-cidade" className="text-slate-400 text-sm font-medium">
              Cidade *
            </Label>
            <Input
              id="checkout-cidade"
              autoComplete="address-level2"
              maxLength={80}
              value={data.cidade}
              onChange={(event) => onChange("cidade", event.target.value)}
              placeholder="Cidade"
              aria-invalid={Boolean(errors.cidade)}
              aria-describedby={errors.cidade ? "checkout-cidade-error" : undefined}
              className={`${inputClass} ${errors.cidade ? "border-red-400/70 focus:border-red-400" : ""}`}
            />
            {errorText("checkout-cidade-error", errors.cidade)}
          </div>

          <div>
            <Label htmlFor="checkout-uf" className="text-slate-400 text-sm font-medium">
              UF *
            </Label>
            <Input
              id="checkout-uf"
              autoComplete="address-level1"
              maxLength={2}
              value={data.uf}
              onChange={(event) => onChange("uf", event.target.value.toUpperCase())}
              placeholder="PR"
              aria-invalid={Boolean(errors.uf)}
              aria-describedby={errors.uf ? "checkout-uf-error" : undefined}
              className={`${inputClass} uppercase ${errors.uf ? "border-red-400/70 focus:border-red-400" : ""}`}
            />
            {errorText("checkout-uf-error", errors.uf)}
          </div>
        </div>
      </div>
    </div>
  )
}
