import { NextRequest, NextResponse } from "next/server"
import { validateCheckout, type CheckoutData } from "@/lib/checkout"
import {
  CheckoutFlowProviderError,
  CheckoutFlowValidationError,
  executeCheckoutFlow,
} from "@/lib/server/checkout-flow"
import { isAllowedMercadoPagoCheckoutUrl } from "@/lib/server/checkout-url"
import { getOptionalCustomerIdentity } from "@/lib/server/customer-auth"
import {
  getServerEnv,
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "@/lib/server/env"
import { consumeRateLimit } from "@/lib/server/rate-limit"
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/server/request-body"
import { ShippingUnavailableError } from "@/lib/server/shipping-quote"

export const runtime = "nodejs"

function jsonResponse(body: unknown, status: number, extraHeaders?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  })
}

function parseCustomer(value: unknown): CheckoutData | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<Record<keyof CheckoutData, unknown>>
  const fields: Array<keyof CheckoutData> = [
    "nome",
    "email",
    "whatsapp",
    "cep",
    "rua",
    "numero",
    "complemento",
    "bairro",
    "cidade",
    "uf",
  ]

  if (fields.some((field) => typeof candidate[field] !== "string")) {
    return null
  }

  return candidate as CheckoutData
}

export async function POST(request: NextRequest) {
  try {
    const allowed = await consumeRateLimit({ request, scope: "checkout" })
    if (!allowed) {
      return jsonResponse(
        { error: "Muitas tentativas de pagamento. Aguarde alguns minutos e tente novamente." },
        429,
        { "Retry-After": "600" },
      )
    }
  } catch {
    return jsonResponse(
      { error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." },
      503,
    )
  }

  let body: unknown
  try {
    body = await readJsonBody(request)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonResponse({ error: "Pedido inválido." }, 413)
    }
    if (error instanceof InvalidJsonBodyError) {
      return jsonResponse({ error: "Pedido inválido." }, 400)
    }
    return jsonResponse({ error: "Pedido inválido." }, 400)
  }

  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Pedido inválido." }, 400)
  }

  const payload = body as {
    items?: unknown
    customer?: unknown
    selectedQuoteToken?: unknown
    checkoutAttemptId?: unknown
  }
  const customer = parseCustomer(payload.customer)
  if (!customer) {
    return jsonResponse({ error: "Confira seus dados e tente novamente." }, 400)
  }

  const fieldErrors = validateCheckout(customer)
  if (Object.keys(fieldErrors).length > 0) {
    return jsonResponse(
      { error: "Confira seus dados e tente novamente.", fieldErrors },
      400,
    )
  }

  if (
    typeof payload.selectedQuoteToken !== "string" ||
    typeof payload.checkoutAttemptId !== "string"
  ) {
    return jsonResponse(
      { error: "Escolha uma opção de frete e tente novamente." },
      400,
    )
  }

  try {
    const env = getServerEnv()
    const requestOrigin = request.nextUrl.origin
    const siteUrl = resolvePublicSiteUrl(requestOrigin)
    const originHeader = request.headers.get("origin")

    if (
      !isAllowedCheckoutOrigin({
        originHeader,
        configuredSiteUrl: siteUrl,
        requestOrigin,
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
      })
    ) {
      return jsonResponse({ error: "Origem de checkout inválida." }, 403)
    }

    const customerIdentity = await getOptionalCustomerIdentity()
    const result = await executeCheckoutFlow({
      items: payload.items,
      customer,
      customerIdentity,
      selectedQuoteToken: payload.selectedQuoteToken,
      checkoutAttemptId: payload.checkoutAttemptId,
      siteUrl,
      mercadoPagoAccessToken: env.mercadoPagoAccessToken,
      mercadoPagoEnvironment: env.mercadoPagoEnvironment,
    })

    if (result.kind === "shipping_changed") {
      return jsonResponse(
        {
          error: "O valor do frete foi atualizado. Confirme o novo valor para continuar.",
          code: "shipping_changed",
          options: result.options,
        },
        409,
      )
    }

    if (result.kind === "attempt_conflict") {
      return jsonResponse(
        {
          error: "Os dados desta tentativa de pagamento mudaram. Revise o pedido e tente novamente.",
          code: "checkout_attempt_conflict",
        },
        409,
      )
    }

    if (!isAllowedMercadoPagoCheckoutUrl(result.checkoutUrl)) {
      console.error("Unsafe Mercado Pago checkout URL blocked", {
        orderNumber: result.orderNumber,
      })
      return jsonResponse(
        { error: "Não foi possível iniciar o pagamento com segurança. Tente novamente." },
        503,
      )
    }

    return jsonResponse(
      { checkoutUrl: result.checkoutUrl, orderNumber: result.orderNumber },
      result.kind === "created" ? 201 : 200,
    )
  } catch (error) {
    if (error instanceof CheckoutFlowValidationError) {
      return jsonResponse(
        { error: "O frete ou os dados do pedido não são mais válidos. Calcule o frete novamente." },
        400,
      )
    }

    if (error instanceof ShippingUnavailableError) {
      return jsonResponse(
        { error: "Não foi possível atualizar o frete agora. Confira o CEP e tente novamente." },
        503,
      )
    }

    if (error instanceof CheckoutFlowProviderError) {
      return jsonResponse(
        { error: "Não foi possível iniciar o pagamento agora. Você pode tentar novamente ou usar o WhatsApp." },
        503,
      )
    }

    console.error("Checkout creation failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    })
    return jsonResponse(
      { error: "Não foi possível iniciar o pagamento agora. Você pode tentar novamente ou usar o WhatsApp." },
      503,
    )
  }
}
