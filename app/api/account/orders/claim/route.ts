import { type NextRequest } from "next/server"
import { isSameOriginAccountRequest } from "../../../../../lib/server/customer-account-actions.ts"
import {
  claimGuestOrder,
  parseClaimGuestOrderInput,
} from "../../../../../lib/server/customer-order-claim.ts"
import { requireCustomerPageAccess } from "../../../../../lib/server/customer-auth.ts"
import { consumeRateLimit } from "../../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../../lib/server/request-body.ts"

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

export async function POST(request: NextRequest) {
  if (!isSameOriginAccountRequest(request)) {
    return json(403, { ok: false, message: "Requisição inválida." })
  }

  try {
    if (!(await consumeRateLimit({ request, scope: "account-claim" }))) {
      return json(429, { ok: false, message: "Tente novamente em alguns minutos." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  const customer = await requireCustomerPageAccess()

  let input: ReturnType<typeof parseClaimGuestOrderInput>
  try {
    input = parseClaimGuestOrderInput(await readJsonBody(request, 4_096))
  } catch {
    return json(400, { ok: false, message: "Pedido inválido." })
  }

  try {
    const result = await claimGuestOrder({
      publicToken: input.publicToken,
      customer,
    })

    if (result.outcome === "not_claimable") {
      return json(200, {
        ok: false,
        message: "Não foi possível adicionar este pedido à sua conta.",
      })
    }

    return json(200, {
      ok: true,
      outcome: result.outcome,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
    })
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }
}
