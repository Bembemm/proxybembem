import { NextRequest, NextResponse } from "next/server"
import { consumeRateLimit } from "@/lib/server/rate-limit"
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  readJsonBody,
} from "@/lib/server/request-body"
import {
  ShippingUnavailableError,
  buildShippingQuoteResult,
  formatShippingUnavailableMessage,
  toPublicShippingOptions,
} from "@/lib/server/shipping-quote"

export const runtime = "nodejs"

function jsonError(
  error: string,
  status: number,
  headers?: Record<string, string>,
) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "no-store", ...headers },
    },
  )
}

export async function POST(request: NextRequest) {
  try {
    const allowed = await consumeRateLimit({ request, scope: "shipping-quote" })
    if (!allowed) {
      return jsonError("Muitas tentativas. Aguarde alguns minutos e tente novamente.", 429, {
        "Retry-After": "600",
      })
    }
  } catch {
    return jsonError("Não foi possível calcular o frete agora. Tente novamente.", 503)
  }

  let body: unknown
  try {
    body = await readJsonBody(request)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError("Cotação inválida.", 413)
    }
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("Cotação inválida.", 400)
    }
    return jsonError("Cotação inválida.", 400)
  }

  if (!body || typeof body !== "object") {
    return jsonError("Cotação inválida.", 400)
  }

  const payload = body as { items?: unknown; destinationCep?: unknown }
  if (typeof payload.destinationCep !== "string") {
    return jsonError("Informe um CEP válido para calcular o frete.", 400)
  }

  try {
    const result = await buildShippingQuoteResult({
      items: payload.items,
      destinationCep: payload.destinationCep,
    })

    return NextResponse.json(
      { options: toPublicShippingOptions(result) },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    if (error instanceof ShippingUnavailableError) {
      return jsonError(formatShippingUnavailableMessage(error, process.env.VERCEL_ENV), 503)
    }

    return jsonError("Confira o CEP e os produtos do carrinho.", 400)
  }
}
