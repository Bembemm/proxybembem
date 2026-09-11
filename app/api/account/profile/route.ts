import { type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
  parseAccountProfileInput,
} from "../../../../lib/server/customer-account-actions.ts"
import { requireCustomerPageAccess } from "../../../../lib/server/customer-auth.ts"
import {
  ensureOwnCustomerProfile,
  getOwnCustomerProfile,
  updateOwnCustomerProfile,
} from "../../../../lib/server/customer-profiles.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../lib/server/request-body.ts"

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
    if (!(await consumeRateLimit({ request, scope: "account-profile" }))) {
      return json(429, { ok: false, message: "Tente novamente em alguns minutos." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  await requireCustomerPageAccess()

  let input: ReturnType<typeof parseAccountProfileInput>
  try {
    input = parseAccountProfileInput(await readJsonBody(request, 4_096))
  } catch {
    return json(400, { ok: false, message: "Dados inválidos." })
  }

  try {
    const current = await getOwnCustomerProfile()
    const profile = current
      ? await updateOwnCustomerProfile(input)
      : await ensureOwnCustomerProfile(input)

    return json(200, {
      ok: true,
      profile: { name: profile.name, whatsapp: profile.whatsapp },
    })
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }
}
