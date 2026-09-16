export const CUSTOMER_PASSWORD_REQUIREMENTS =
  "A senha precisa ter entre 8 e 128 caracteres e incluir pelo menos uma letra maiúscula, uma minúscula, um número e um símbolo."

const SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~"

export function validateCustomerPassword(password: string) {
  if (
    password.length < 8 ||
    password.length > 128 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    ![...password].some((character) => SYMBOLS.includes(character))
  ) {
    return CUSTOMER_PASSWORD_REQUIREMENTS
  }

  return null
}
