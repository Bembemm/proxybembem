import type { CartItem } from "@/contexts/cart-context"

export interface CheckoutData {
  nome: string
  whatsapp: string
  cep: string
}

export interface CheckoutErrors {
  nome?: string
  whatsapp?: string
  cep?: string
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "")
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

export function validateCheckout(data: CheckoutData): CheckoutErrors {
  const errors: CheckoutErrors = {}
  const normalizedName = data.nome.trim().replace(/\s+/g, " ")
  const whatsapp = digitsOnly(data.whatsapp)
  const cep = digitsOnly(data.cep)

  if (normalizedName.length < 3 || normalizedName.length > 100) {
    errors.nome = "Informe seu nome."
  }

  if (!/^\d{10,11}$/.test(whatsapp)) {
    errors.whatsapp = "Informe um WhatsApp válido com DDD."
  }

  if (!/^\d{8}$/.test(cep) || /^(\d)\1{7}$/.test(cep)) {
    errors.cep = "Informe um CEP válido com 8 dígitos."
  }

  return errors
}

export function buildWhatsAppOrderMessage(
  items: CartItem[],
  totalPrice: number,
  data: CheckoutData,
) {
  const productsList = items
    .map((item) => `- ${item.quantity}x ${item.product.title}`)
    .join("\n")

  return `--- NOVO PEDIDO ---

Produtos:
${productsList}

Subtotal (produtos): ${formatPrice(totalPrice)}
Frete: A calcular

Cliente:
Nome: ${data.nome.trim()}
WhatsApp: ${formatWhatsapp(data.whatsapp)}
CEP para cálculo do frete: ${formatCep(data.cep)}

O endereço completo e outros dados necessários para envio/pagamento serão confirmados diretamente no atendimento.
-------------------`
}

export function buildWhatsAppOrderUrl(message: string) {
  return `https://wa.me/5544991250332?text=${encodeURIComponent(message)}`
}
