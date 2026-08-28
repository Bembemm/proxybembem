import { NextRequest, NextResponse } from "next/server"
import {
  ShippingUnavailableError,
  buildShippingQuoteResult,
  toPublicShippingOptions,
} from "@/lib/server/shipping-quote"

export const runtime = "nodejs"

const MAX_BODY_BYTES = 32_768

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonError("Cotação inválida.", 413)
  }

  let text: string
  try {
    text = await request.text()
  } catch {
    return jsonError("Cotação inválida.", 400)
  }

  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return jsonError("Cotação inválida.", 413)
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
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
      return jsonError(
        "Não foi possível calcular o frete agora. Confira o CEP e tente novamente.",
        503,
      )
    }

    return jsonError("Confira o CEP e os produtos do carrinho.", 400)
  }
}
