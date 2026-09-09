export const MELHOR_ENVIO_PHASE5_SCOPES = [
  "shipping-calculate",
  "cart-read",
  "cart-write",
  "orders-read",
  "shipping-checkout",
  "shipping-generate",
  "shipping-print",
  "shipping-tracking",
  "shipping-cancel",
] as const

export type MelhorEnvioOAuthScope =
  (typeof MELHOR_ENVIO_PHASE5_SCOPES)[number]

const SCOPE_SET = new Set<string>(MELHOR_ENVIO_PHASE5_SCOPES)

export function isMelhorEnvioOAuthScope(
  value: unknown,
): value is MelhorEnvioOAuthScope {
  return typeof value === "string" && SCOPE_SET.has(value)
}

export function normalizeMelhorEnvioScopes(
  value: unknown,
): MelhorEnvioOAuthScope[] {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error("Invalid Melhor Envio OAuth scopes")
  }

  const scopes: MelhorEnvioOAuthScope[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    if (!isMelhorEnvioOAuthScope(candidate) || seen.has(candidate)) {
      throw new Error("Invalid Melhor Envio OAuth scopes")
    }
    seen.add(candidate)
    scopes.push(candidate)
  }
  return scopes
}

export function hasMelhorEnvioScopes(
  granted: readonly string[],
  required: readonly MelhorEnvioOAuthScope[],
): boolean {
  const grantedSet = new Set(granted)
  return required.every((scope) => grantedSet.has(scope))
}

export function melhorEnvioPhase5ScopeParameter(): string {
  return MELHOR_ENVIO_PHASE5_SCOPES.join(" ")
}
