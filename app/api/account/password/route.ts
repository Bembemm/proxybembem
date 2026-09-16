import { type NextRequest } from "next/server"
import {
  CustomerPasswordPolicyError,
  isSameOriginAccountRequest,
  parseAccountPasswordUpdateInput,
} from "../../../../lib/server/customer-account-actions.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../lib/server/request-body.ts"
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts"

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

  let input: ReturnType<typeof parseAccountPasswordUpdateInput>
  try {
    input = parseAccountPasswordUpdateInput(await readJsonBody(request, 4_096))
  } catch (error) {
    if (error instanceof CustomerPasswordPolicyError) {
      return json(400, { ok: false, message: error.message })
    }
    return json(400, { ok: false, message: "Nova senha inválida." })
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { data, error: userError } = await supabase.auth.getUser()
    if (userError || !data.user?.email_confirmed_at) {
      return json(401, { ok: false, message: "Autenticação necessária." })
    }

    const { error } = await supabase.auth.updateUser({ password: input.password })
    if (error) {
      return json(400, { ok: false, message: "Não foi possível atualizar a senha." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  return json(200, { ok: true })
}
