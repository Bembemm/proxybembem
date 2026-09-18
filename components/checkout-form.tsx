import { Mail, MapPin, MessageCircle, User } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  formatCep,
  formatCpf,
  formatWhatsapp,
  type CheckoutData,
  type CheckoutErrors,
  type CheckoutSavedAddress,
} from "@/lib/checkout"

interface CheckoutFormProps {
  data: CheckoutData
  errors: CheckoutErrors
  savedAddresses?: CheckoutSavedAddress[]
  onSelectSavedAddress?: (address: CheckoutSavedAddress) => void
  onChange: (field: keyof CheckoutData, value: string) => void
}

function errorText(id: string, message?: string) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-sm text-red-600">
      {message}
    </p>
  )
}

export function CheckoutForm({
  data,
  errors,
  savedAddresses = [],
  onSelectSavedAddress,
  onChange,
}: CheckoutFormProps) {
  const inputClass =
    "mt-1.5 h-12 rounded-lg border-slate-300 bg-white text-base text-slate-950 placeholder:text-slate-400 focus-visible:border-[#8B5CF6] focus-visible:ring-[#8B5CF6]/20"
  const labelClass = "text-sm font-medium text-slate-700"

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-slate-950">
        <User className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Dados de contato</h1>
      </div>

      <div>
        <Label htmlFor="checkout-nome" className={labelClass}>
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
          className={`${inputClass} ${errors.nome ? "border-red-500 focus-visible:border-red-500" : ""}`}
        />
        {errorText("checkout-nome-error", errors.nome)}
      </div>

      <div>
        <Label htmlFor="checkout-email" className={labelClass}>
          E-mail *
        </Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
            className={`${inputClass} pl-10 ${errors.email ? "border-red-500 focus-visible:border-red-500" : ""}`}
          />
        </div>
        {errors.email ? (
          errorText("checkout-email-error", errors.email)
        ) : (
          <p id="checkout-email-help" className="mt-1 text-sm text-slate-500">
            Usaremos este e-mail para identificar seu pedido e sua conta.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="checkout-whatsapp" className={labelClass}>
          WhatsApp com DDD *
        </Label>
        <div className="relative">
          <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
            className={`${inputClass} pl-10 ${errors.whatsapp ? "border-red-500 focus-visible:border-red-500" : ""}`}
          />
        </div>
        {errors.whatsapp ? (
          errorText("checkout-whatsapp-error", errors.whatsapp)
        ) : (
          <p id="checkout-whatsapp-help" className="mt-1 text-sm text-slate-500">
            Usaremos este número somente se for necessário falar sobre o pedido ou a entrega.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="checkout-cpf" className={labelClass}>
          CPF do destinatário *
        </Label>
        <Input
          id="checkout-cpf"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          required
          value={data.cpf ?? ""}
          onChange={(event) => onChange("cpf", formatCpf(event.target.value))}
          placeholder="000.000.000-00"
          aria-invalid={Boolean(errors.cpf)}
          aria-describedby={errors.cpf ? "checkout-cpf-error" : "checkout-cpf-help"}
          className={`${inputClass} ${errors.cpf ? "border-red-500 focus-visible:border-red-500" : ""}`}
        />
        {errors.cpf ? (
          errorText("checkout-cpf-error", errors.cpf)
        ) : (
          <p id="checkout-cpf-help" className="mt-1 text-sm text-slate-500">
            Usado somente para preparar a entrega com a transportadora.
          </p>
        )}
      </div>

      <div className="border-t border-slate-200 pt-6">
        <div className="mb-3 flex items-center gap-2 text-slate-950">
          <MapPin className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Entrega</h2>
        </div>

        {savedAddresses.length > 0 && onSelectSavedAddress ? (
          <div className="mb-5 rounded-xl border border-violet-100 bg-violet-50/50 p-4">
            <p className="text-sm font-semibold text-slate-900">Endereços salvos</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Selecione um endereço para preencher os campos abaixo. Você ainda pode editar qualquer dado antes de pagar.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {savedAddresses.map((address) => (
                <button
                  key={address.id}
                  type="button"
                  onClick={() => onSelectSavedAddress(address)}
                  className="rounded-lg border border-violet-200 bg-white p-3 text-left text-sm transition hover:border-violet-300 hover:bg-violet-50"
                >
                  <span className="flex items-center justify-between gap-2 font-semibold text-slate-900">
                    <span>{address.label}</span>
                    {address.isDefault ? (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-700">
                        Padrão
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block leading-5 text-slate-600">
                    {address.street}, {address.number} — {address.city}/{address.state}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <Label htmlFor="checkout-cep" className={labelClass}>
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
            className={`${inputClass} ${errors.cep ? "border-red-500 focus-visible:border-red-500" : ""}`}
          />
          {errors.cep ? (
            errorText("checkout-cep-error", errors.cep)
          ) : (
            <p id="checkout-cep-help" className="mt-1 text-sm text-slate-500">
              O frete é recalculado e validado antes do pagamento.
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_110px]">
          <div>
            <Label htmlFor="checkout-rua" className={labelClass}>Rua / Avenida *</Label>
            <Input
              id="checkout-rua"
              autoComplete="street-address"
              maxLength={120}
              value={data.rua}
              onChange={(event) => onChange("rua", event.target.value)}
              placeholder="Nome da rua"
              aria-invalid={Boolean(errors.rua)}
              aria-describedby={errors.rua ? "checkout-rua-error" : undefined}
              className={`${inputClass} ${errors.rua ? "border-red-500 focus-visible:border-red-500" : ""}`}
            />
            {errorText("checkout-rua-error", errors.rua)}
          </div>

          <div>
            <Label htmlFor="checkout-numero" className={labelClass}>Número *</Label>
            <Input
              id="checkout-numero"
              maxLength={20}
              value={data.numero}
              onChange={(event) => onChange("numero", event.target.value)}
              placeholder="123"
              aria-invalid={Boolean(errors.numero)}
              aria-describedby={errors.numero ? "checkout-numero-error" : undefined}
              className={`${inputClass} ${errors.numero ? "border-red-500 focus-visible:border-red-500" : ""}`}
            />
            {errorText("checkout-numero-error", errors.numero)}
          </div>
        </div>

        <div className="mt-4">
          <Label htmlFor="checkout-complemento" className={labelClass}>Complemento</Label>
          <Input
            id="checkout-complemento"
            autoComplete="address-line2"
            maxLength={80}
            value={data.complemento}
            onChange={(event) => onChange("complemento", event.target.value)}
            placeholder="Apto, bloco, referência..."
            aria-invalid={Boolean(errors.complemento)}
            aria-describedby={errors.complemento ? "checkout-complemento-error" : undefined}
            className={`${inputClass} ${errors.complemento ? "border-red-500 focus-visible:border-red-500" : ""}`}
          />
          {errorText("checkout-complemento-error", errors.complemento)}
        </div>

        <div className="mt-4">
          <Label htmlFor="checkout-bairro" className={labelClass}>Bairro *</Label>
          <Input
            id="checkout-bairro"
            autoComplete="address-level3"
            maxLength={80}
            value={data.bairro}
            onChange={(event) => onChange("bairro", event.target.value)}
            placeholder="Bairro"
            aria-invalid={Boolean(errors.bairro)}
            aria-describedby={errors.bairro ? "checkout-bairro-error" : undefined}
            className={`${inputClass} ${errors.bairro ? "border-red-500 focus-visible:border-red-500" : ""}`}
          />
          {errorText("checkout-bairro-error", errors.bairro)}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_90px]">
          <div>
            <Label htmlFor="checkout-cidade" className={labelClass}>Cidade *</Label>
            <Input
              id="checkout-cidade"
              autoComplete="address-level2"
              maxLength={80}
              value={data.cidade}
              onChange={(event) => onChange("cidade", event.target.value)}
              placeholder="Cidade"
              aria-invalid={Boolean(errors.cidade)}
              aria-describedby={errors.cidade ? "checkout-cidade-error" : undefined}
              className={`${inputClass} ${errors.cidade ? "border-red-500 focus-visible:border-red-500" : ""}`}
            />
            {errorText("checkout-cidade-error", errors.cidade)}
          </div>

          <div>
            <Label htmlFor="checkout-uf" className={labelClass}>UF *</Label>
            <Input
              id="checkout-uf"
              autoComplete="address-level1"
              maxLength={2}
              value={data.uf}
              onChange={(event) => onChange("uf", event.target.value.toUpperCase())}
              placeholder="PR"
              aria-invalid={Boolean(errors.uf)}
              aria-describedby={errors.uf ? "checkout-uf-error" : undefined}
              className={`${inputClass} uppercase ${errors.uf ? "border-red-500 focus-visible:border-red-500" : ""}`}
            />
            {errorText("checkout-uf-error", errors.uf)}
          </div>
        </div>
      </div>
    </div>
  )
}
