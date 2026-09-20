import { NextRequest, NextResponse } from "next/server"
import {
  CepLookupUnavailableError,
  CepNotFoundError,
  lookupBrazilianCep,
} from "@/lib/server/cep-lookup"
import {
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "@/lib/server/env"
import { consumeRateLimit } from "@/lib/server/rate-limit"
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  readJsonBody,
} from "@/lib/server/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function isAllowedOrigin(request: NextRequest) {
  try {
    const requestOrigin = request.nextUrl.origin
    return isAllowedCheckoutOrigin({
      originHeader: request.headers.get("origin"),
      configuredSiteUrl: resolvePublicSiteUrl(requestOrigin),
      requestOrigin,
      nodeEnv: process.env.NODE_ENV,
    })
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return json({ error: "Consulta de CEP inválida." }, 403)
  }

  try {
    const allowed = await consumeRateLimit({ request, scope: "address-lookup" })
    if (!allowed) {
      return json(
        { error: "Muitas consultas de CEP. Aguarde alguns minutos e tente novamente." },
        429,
      )
    }
  } catch {
    return json({ error: "Não foi possível consultar o CEP agora." }, 503)
  }

  let body: unknown
  try {
    body = await readJsonBody(request, 4_096)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "Consulta de CEP inválida." }, 413)
    }
    if (error instanceof InvalidJsonBodyError) {
      return json({ error: "Consulta de CEP inválida." }, 400)
    }
    return json({ error: "Consulta de CEP inválida." }, 400)
  }

  if (!body || typeof body !== "object") {
    return json({ error: "Consulta de CEP inválida." }, 400)
  }

  const cep = (body as { cep?: unknown }).cep
  if (typeof cep !== "string" || !/^\d{8}$/.test(cep.replace(/\D/g, ""))) {
    return json({ error: "Informe um CEP válido." }, 400)
  }

  try {
    const address = await lookupBrazilianCep(cep)
    return json({ address }, 200)
  } catch (error) {
    if (error instanceof CepNotFoundError) {
      return json({ error: "CEP não encontrado." }, 404)
    }
    if (error instanceof CepLookupUnavailableError) {
      return json({ error: "Não foi possível consultar o CEP agora." }, 503)
    }
    return json({ error: "Informe um CEP válido." }, 400)
  }
}
