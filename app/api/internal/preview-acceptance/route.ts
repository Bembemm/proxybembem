import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { POST as checkoutPost } from "@/app/api/checkout/route"
import { POST as shippingQuotePost } from "@/app/api/shipping/quote/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DESTINATION_CEP = "01001000"

function makeRequest(path: string, body: unknown, scope: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const origin = configuredOrigin ? new URL(configuredOrigin).origin : "https://preview.proxybembem.invalid"

  return new NextRequest(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-forwarded-for": `198.51.100.${scope === "quote" ? "10" : "11"}`,
    },
    body: JSON.stringify(body),
  })
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {} as Record<string, unknown>
  }
}

async function quote(quantity: number) {
  const response = await shippingQuotePost(
    makeRequest(
      "/api/shipping/quote",
      {
        destinationCep: DESTINATION_CEP,
        items: [{ productId: 1, quantity }],
      },
      "quote",
    ),
  )
  const body = await readJson(response)
  const options = Array.isArray(body.options) ? body.options : []

  return {
    status: response.status,
    options: options.map((option) => {
      const value = option as Record<string, unknown>
      return {
        serviceId: value.serviceId,
        serviceName: value.serviceName,
        carrierName: value.carrierName,
        priceCents: value.priceCents,
        deliveryDays: value.deliveryDays,
      }
    }),
    rawOptions: options,
    error: typeof body.error === "string" ? body.error : null,
  }
}

function customer() {
  return {
    nome: "Teste Preview ProxyBembem",
    whatsapp: "44999999999",
    cep: DESTINATION_CEP,
    rua: "Praça da Sé",
    numero: "1",
    complemento: "",
    bairro: "Sé",
    cidade: "São Paulo",
    uf: "SP",
  }
}

async function checkout(input: {
  quantity: number
  selectedQuoteToken: string
  checkoutAttemptId: string
}) {
  const response = await checkoutPost(
    makeRequest(
      "/api/checkout",
      {
        items: [{ productId: 1, quantity: input.quantity }],
        customer: customer(),
        selectedQuoteToken: input.selectedQuoteToken,
        checkoutAttemptId: input.checkoutAttemptId,
      },
      "checkout",
    ),
  )
  const body = await readJson(response)
  const checkoutUrl = typeof body.checkoutUrl === "string" ? body.checkoutUrl : null

  return {
    status: response.status,
    orderNumber: typeof body.orderNumber === "string" ? body.orderNumber : null,
    checkoutUrl,
    checkoutHost: checkoutUrl ? new URL(checkoutUrl).hostname : null,
    code: typeof body.code === "string" ? body.code : null,
    error: typeof body.error === "string" ? body.error : null,
    options: Array.isArray(body.options) ? body.options : [],
  }
}

function tokenForService(options: unknown[], serviceId: unknown) {
  const selected = options.find((option) => {
    const value = option as Record<string, unknown>
    return value.serviceId === serviceId && typeof value.quoteToken === "string"
  }) as Record<string, unknown> | undefined

  return selected && typeof selected.quoteToken === "string" ? selected.quoteToken : null
}

async function acceptedCheckout(quantity: number, initialQuote: Awaited<ReturnType<typeof quote>>) {
  const firstOption = initialQuote.rawOptions[0] as Record<string, unknown> | undefined
  if (!firstOption || typeof firstOption.quoteToken !== "string") {
    return { first: null, retry: null, attemptId: null }
  }

  const attemptId = randomUUID()
  let selectedQuoteToken = firstOption.quoteToken
  let first = await checkout({ quantity, selectedQuoteToken, checkoutAttemptId: attemptId })

  if (first.status === 409 && first.code === "shipping_changed") {
    const replacement = tokenForService(first.options, firstOption.serviceId)
    if (replacement) {
      selectedQuoteToken = replacement
      first = await checkout({ quantity, selectedQuoteToken, checkoutAttemptId: attemptId })
    }
  }

  const retry = first.orderNumber
    ? await checkout({ quantity, selectedQuoteToken, checkoutAttemptId: attemptId })
    : null

  return { first, retry, attemptId }
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ ok: false, error: "not_preview" }, { status: 404 })
  }

  const q1 = await quote(1)
  const q2 = await quote(2)
  const checkout1 = q1.status === 200 ? await acceptedCheckout(1, q1) : null
  const checkout2 = q2.status === 200 ? await acceptedCheckout(2, q2) : null

  const sanitizedCheckout = (result: typeof checkout1) => {
    if (!result) return null
    const first = result.first
    const retry = result.retry
    return {
      first: first
        ? {
            status: first.status,
            orderNumber: first.orderNumber,
            checkoutHost: first.checkoutHost,
            code: first.code,
            error: first.error,
          }
        : null,
      retry: retry
        ? {
            status: retry.status,
            orderNumber: retry.orderNumber,
            checkoutHost: retry.checkoutHost,
            code: retry.code,
            error: retry.error,
          }
        : null,
      sameOrder: Boolean(first?.orderNumber && first.orderNumber === retry?.orderNumber),
      sameCheckoutUrl: Boolean(first?.checkoutUrl && first.checkoutUrl === retry?.checkoutUrl),
    }
  }

  return Response.json(
    {
      ok: true,
      environment: process.env.VERCEL_ENV,
      quote1: { status: q1.status, options: q1.options, error: q1.error },
      quote2: { status: q2.status, options: q2.options, error: q2.error },
      checkout1: sanitizedCheckout(checkout1),
      checkout2: sanitizedCheckout(checkout2),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
