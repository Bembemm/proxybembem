import { type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
} from "../../../../../../lib/server/customer-account-actions.ts"
import { requireCustomerPageAccess } from "../../../../../../lib/server/customer-auth.ts"
import {
  deleteOwnCustomerAddress,
  setDefaultOwnCustomerAddress,
  updateOwnCustomerAddress,
} from "../../../../../../lib/server/customer-addresses.ts"
import { consumeRateLimit } from "../../../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../../../lib/server/request-body.ts"

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

function publicAddress(address: Awaited<ReturnType<typeof updateOwnCustomerAddress>>) {
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

async function authorizeMutation(request: NextRequest) {
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
  return null
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejected = await authorizeMutation(request)
  if (rejected) return rejected

  let body: unknown
  try {
    body = await readJsonBody(request, 8_192)
  } catch {
    return json(400, { ok: false, message: "Endereço inválido." })
  }

  try {
    const { id } = await params
    const address = await updateOwnCustomerAddress(id, body)
    return json(200, { ok: true, address: publicAddress(address) })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Invalid customer address input" ||
        error.message === "Invalid customer address id")
    ) {
      return json(400, { ok: false, message: "Endereço inválido." })
    }
    return json(404, { ok: false, message: "Endereço não encontrado." })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejected = await authorizeMutation(request)
  if (rejected) return rejected

  let body: unknown
  try {
    body = await readJsonBody(request, 8_192)
  } catch {
    return json(400, { ok: false, message: "Solicitação inválida." })
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    (body as { isDefault?: unknown }).isDefault !== true
  ) {
    return json(400, { ok: false, message: "Solicitação inválida." })
  }

  try {
    const { id } = await params
    const address = await setDefaultOwnCustomerAddress(id)
    return json(200, { ok: true, address: publicAddress(address) })
  } catch {
    return json(404, { ok: false, message: "Endereço não encontrado." })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejected = await authorizeMutation(request)
  if (rejected) return rejected

  // DELETE has no user payload, but keep the same bounded-body contract visible
  // to the route family and reject any unexpected body.
  try {
    if (request.headers.get("content-length") && request.headers.get("content-length") !== "0") {
      await readJsonBody(request, 8_192)
    }
  } catch {
    return json(400, { ok: false, message: "Solicitação inválida." })
  }

  try {
    const { id } = await params
    await deleteOwnCustomerAddress(id)
    return json(200, { ok: true })
  } catch {
    return json(404, { ok: false, message: "Endereço não encontrado." })
  }
}
