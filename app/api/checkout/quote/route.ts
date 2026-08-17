import { NextResponse } from "next/server"
import {
  CheckoutValidationError,
  priceCheckoutItems,
} from "@/lib/server/checkout"

export const runtime = "nodejs"

function getItemsFromBody(body: unknown) {
  if (typeof body !== "object" || body === null) {
    return undefined
  }

  return (body as Record<string, unknown>).items
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json()
    const quote = priceCheckoutItems(getItemsFromBody(body))

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
