import type { CartItem } from "@/contexts/cart-context"

export interface CheckoutData {
  nome: string
  email: string
  whatsapp: string
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

export function normalizeCheckoutData(data: CheckoutData): CheckoutData {
  return {
    nome: normalizeText(data.nome),
    email: normalizeCheckoutEmail(data.email),
    whatsapp: digitsOnly(data.whatsapp),
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

export function buildWhatsAppOrderUrl(message: string) {
  return `https://wa.me/5544991250332?text=${encodeURIComponent(message)}`
}
