import type { CartItem } from "@/contexts/cart-context"

export interface CheckoutData {
  nome: string
  email: string
  whatsapp: string
  cpf?: string
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export interface CheckoutErrors {
  nome?: string
  email?: string
  whatsapp?: string
  cpf?: string
  cep?: string
  rua?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
}

export interface WhatsAppShippingSummary {
  carrierName: string
  serviceName: string
  priceCents: number
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "")
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function normalizeCheckoutEmail(value: string) {
  return value.trim().toLowerCase()
}

export function isValidCpf(value: string) {
  const cpf = digitsOnly(value)
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false

  const checkDigit = (length: 9 | 10) => {
    let sum = 0
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index)
    }
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10])
}

export function formatCpf(value: string) {
  const numbers = digitsOnly(value).slice(0, 11)
  return numbers
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

export function formatCep(value: string) {
  const numbers = digitsOnly(value).slice(0, 8)
  return numbers.replace(/(\d{5})(\d)/, "$1-$2")
}

export function formatWhatsapp(value: string) {
  const numbers = digitsOnly(value).slice(0, 11)

  if (numbers.length <= 2) {
    return numbers ? `(${numbers}` : ""
  }

  const ddd = numbers.slice(0, 2)
  const local = numbers.slice(2)

  if (local.length <= 4) {
    return `(${ddd}) ${local}`
  }

  if (local.length <= 8) {
    return `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`
  }

  return `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
}

export function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export function normalizeCheckoutData(data: CheckoutData): CheckoutData & { cpf: string } {
  return {
    nome: normalizeText(data.nome),
    email: normalizeCheckoutEmail(data.email),
    whatsapp: digitsOnly(data.whatsapp),
    cpf: digitsOnly(data.cpf ?? ""),
    cep: digitsOnly(data.cep),
    rua: normalizeText(data.rua),
    numero: normalizeText(data.numero),
    complemento: normalizeText(data.complemento),
    bairro: normalizeText(data.bairro),
    cidade: normalizeText(data.cidade),
    uf: normalizeText(data.uf).toUpperCase(),
  }
}

export function validateCheckout(data: CheckoutData): CheckoutErrors {
  const errors: CheckoutErrors = {}
  const normalized = normalizeCheckoutData(data)

  if (normalized.nome.length < 3 || normalized.nome.length > 100) {
    errors.nome = "Informe seu nome."
  }

  if (
    normalized.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)
  ) {
    errors.email = "Informe um e-mail válido."
  }

  if (!/^\d{10,11}$/.test(normalized.whatsapp)) {
    errors.whatsapp = "Informe um WhatsApp válido com DDD."
  }

  if (!isValidCpf(normalized.cpf)) {
    errors.cpf = "Informe um CPF válido."
  }

  if (!/^\d{8}$/.test(normalized.cep) || /^(\d)\1{7}$/.test(normalized.cep)) {
    errors.cep = "Informe um CEP válido com 8 dígitos."
  }

  if (normalized.rua.length < 2 || normalized.rua.length > 120) {
    errors.rua = "Informe a rua do endereço."
  }

  if (normalized.numero.length < 1 || normalized.numero.length > 20) {
    errors.numero = "Informe o número do endereço."
  }

  if (normalized.complemento.length > 80) {
    errors.complemento = "O complemento é muito longo."
  }

  if (normalized.bairro.length < 2 || normalized.bairro.length > 80) {
    errors.bairro = "Informe o bairro."
  }

  if (normalized.cidade.length < 2 || normalized.cidade.length > 80) {
    errors.cidade = "Informe a cidade."
  }

  if (!/^[A-Z]{2}$/.test(normalized.uf)) {
    errors.uf = "Informe a UF com 2 letras."
  }

  return errors
}

export function buildWhatsAppOrderMessage(
  items: CartItem[],
  totalPrice: number,
  data: CheckoutData,
  shipping?: WhatsAppShippingSummary | null,
) {
  const productsList = items
    .map((item) => `- ${item.quantity}x ${item.product.title}`)
    .join("\n")
  const normalized = normalizeCheckoutData(data)
  const freight = shipping
    ? `${formatPrice(shipping.priceCents / 100)} (${shipping.carrierName} / ${shipping.serviceName})`
    : "não selecionado no site"
  const total = shipping
    ? `\nTotal: ${formatPrice(totalPrice + shipping.priceCents / 100)}`
    : ""

  return `--- NOVO PEDIDO ---

Produtos:
${productsList}

Subtotal (produtos): ${formatPrice(totalPrice)}
Frete: ${freight}${total}

Cliente:
Nome: ${normalized.nome}
E-mail: ${normalized.email}
WhatsApp: ${formatWhatsapp(normalized.whatsapp)}

Endereço de entrega:
${normalized.rua}, ${normalized.numero}${normalized.complemento ? ` - ${normalized.complemento}` : ""}
${normalized.bairro} - ${normalized.cidade}/${normalized.uf}
CEP: ${formatCep(normalized.cep)}
-------------------`
}

export function buildWhatsAppOrderUrl(
  destinationE164: string | null | undefined,
  message: string,
): string | null {
  if (!destinationE164 || !/^\+[1-9][0-9]{7,14}$/.test(destinationE164)) return null

  return `https://wa.me/${destinationE164.slice(1)}?text=${encodeURIComponent(message)}`
}
