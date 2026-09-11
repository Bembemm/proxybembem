import { createHash } from "node:crypto"
import { normalizeCheckoutData, type CheckoutData } from "../checkout.ts"
import type { ShippingQuoteClaims } from "./shipping-quote-token.ts"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NIL_UUID = "00000000-0000-0000-0000-000000000000"

export function parseCheckoutAttemptId(value: unknown): string | null {
  if (typeof value !== "string" || value.length !== 36 || !UUID_PATTERN.test(value)) {
    return null
  }

  const normalized = value.toLowerCase()
  return normalized === NIL_UUID ? null : normalized
}

export function createCheckoutFingerprint(input: {
  cartFingerprint: string
  customer: CheckoutData
  quoteClaims: ShippingQuoteClaims
}): string {
  if (!/^[a-f0-9]{64}$/i.test(input.cartFingerprint)) {
    throw new Error("Invalid cart fingerprint")
  }

  const customer = normalizeCheckoutData(input.customer)
  const stable = {
    cartFingerprint: input.cartFingerprint.toLowerCase(),
    customer: {
      nome: customer.nome,
      email: customer.email,
      whatsapp: customer.whatsapp,
      cpf: customer.cpf,
      cep: customer.cep,
      rua: customer.rua,
      numero: customer.numero,
      complemento: customer.complemento,
      bairro: customer.bairro,
      cidade: customer.cidade,
      uf: customer.uf,
    },
    shipping: {
      serviceId: input.quoteClaims.serviceId,
      priceCents: input.quoteClaims.priceCents,
      destinationCep: input.quoteClaims.destinationCep,
      cartFingerprint: input.quoteClaims.cartFingerprint,
    },
  }

  return createHash("sha256").update(JSON.stringify(stable)).digest("hex")
}
