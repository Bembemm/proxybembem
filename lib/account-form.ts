import { validateCustomerPassword } from "./auth/password-policy.ts"
import { digitsOnly } from "./checkout.ts"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type AccountFieldErrors = Partial<
  Record<"name" | "email" | "whatsapp" | "password" | "confirmPassword", string>
>

export function validateAccountName(value: string) {
  const name = value.trim().replace(/\s+/g, " ")
  return name.length >= 3 && name.length <= 100 ? undefined : "Informe seu nome."
}

export function validateAccountEmail(value: string) {
  const email = value.trim().toLowerCase()
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email)
    ? undefined
    : "Informe um e-mail válido."
}

export function validateAccountWhatsapp(value: string) {
  return /^\d{10,11}$/.test(digitsOnly(value))
    ? undefined
    : "Informe um WhatsApp válido com DDD."
}

export function validateAccountPassword(value: string) {
  return validateCustomerPassword(value) ?? undefined
}

export function validateAccountPasswordConfirmation(
  password: string,
  confirmPassword: string,
) {
  return password === confirmPassword ? undefined : "As senhas não coincidem."
}

export function hasAccountFieldErrors(errors: AccountFieldErrors) {
  return Object.values(errors).some(Boolean)
}
