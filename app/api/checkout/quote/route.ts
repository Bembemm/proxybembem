import { NextResponse } from "next/server"
import {
  CheckoutValidationError,
  priceCheckoutItems,
} from "@/lib/server/checkout"
import type { CheckoutItemInput } from "@/types/commerce"

export const runtime = "nodejs"

interface QuoteRequestBody {
  items?: CheckoutItemInput[]
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as QuoteRequestBody
    const quote = priceCheckoutItems(body.items ?? [])

    return NextResponse.json(quote)
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
    }

    console.error("Failed to create checkout quote", error)

    return NextResponse.json(
      { error: "Não foi possível calcular o pedido." },
      { status: 500 },
    )
  }
}
