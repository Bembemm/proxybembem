export interface CepLookupResult {
  cep: string
  street: string
  neighborhood: string
  city: string
  state: string
}

export class CepNotFoundError extends Error {
  constructor() {
    super("CEP not found")
    this.name = "CepNotFoundError"
  }
}

export class CepLookupUnavailableError extends Error {
  constructor() {
    super("CEP lookup unavailable")
    this.name = "CepLookupUnavailableError"
  }
}

function normalizedCep(value: string) {
  const cep = value.replace(/\D/g, "")
  if (!/^\d{8}$/.test(cep)) {
    throw new Error("Invalid CEP")
  }
  return cep
}

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return ""
  const text = value.trim().replace(/\s+/g, " ")
  return text.length <= maxLength ? text : ""
}

export async function lookupBrazilianCep(
  value: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CepLookupResult> {
  const cep = normalizedCep(value)

  let response: Response
  try {
    response = await fetchImpl(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw new CepLookupUnavailableError()
  }

  if (!response.ok) {
    throw new CepLookupUnavailableError()
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new CepLookupUnavailableError()
  }

  if (!payload || typeof payload !== "object") {
    throw new CepLookupUnavailableError()
  }

  const candidate = payload as Record<string, unknown>
  if (candidate.erro === true || candidate.erro === "true") {
    throw new CepNotFoundError()
  }

  const city = optionalText(candidate.localidade, 80)
  const state = optionalText(candidate.uf, 2).toUpperCase()
  if (city.length < 2 || !/^[A-Z]{2}$/.test(state)) {
    throw new CepLookupUnavailableError()
  }

  return {
    cep,
    street: optionalText(candidate.logradouro, 120),
    neighborhood: optionalText(candidate.bairro, 80),
    city,
    state,
  }
}
