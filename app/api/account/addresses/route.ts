import { type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
} from "../../../../lib/server/customer-account-actions.ts"
import { requireCustomerPageAccess } from "../../../../lib/server/customer-auth.ts"
import { createOwnCustomerAddress } from "../../../../lib/server/customer-addresses.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../lib/server/request-body.ts"

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

function publicAddress(address: Awaited<ReturnType<typeof createOwnCustomerAddress>>) {
  return {
    id: address.id,
    label: address.label,
    cep: address.cep,
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    isDefault: address.isDefault,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginAccountRequest(request)) {
    return json(403, { ok: false, message: "Requisição inválida." })
  }

  try {
    if (!(await consumeRateLimit({ request, scope: "account-address" }))) {
      return json(429, { ok: false, message: "Tente novamente em alguns minutos." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  await requireCustomerPageAccess()

  let body: unknown
  try {
    body = await readJsonBody(request, 8_192)
  } catch {
    return json(400, { ok: false, message: "Endereço inválido." })
  }

  try {
    const address = await createOwnCustomerAddress(body)
    return json(201, { ok: true, address: publicAddress(address) })
  } catch (error) {
    if (error instanceof Error && error.message === "Customer address limit reached") {
      return json(409, {
        ok: false,
        message: "Você pode salvar no máximo 5 endereços.",
      })
    }
    if (error instanceof Error && error.message === "Invalid customer address input") {
      return json(400, { ok: false, message: "Endereço inválido." })
    }
    return json(503, { ok: false, message: "Não foi possível salvar o endereço agora." })
  }
}
