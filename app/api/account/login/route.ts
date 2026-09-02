import { type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
  parseAccountLoginInput,
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
    if (!(await consumeRateLimit({ request, scope: "account-login" }))) {
      return json(429, { ok: false, message: "Tente novamente em alguns minutos." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  let input: ReturnType<typeof parseAccountLoginInput>
  try {
    input = parseAccountLoginInput(await readJsonBody(request, 4_096))
  } catch {
    return json(400, { ok: false, message: "Credenciais inválidas." })
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    })
    if (error) {
      return json(401, { ok: false, message: "E-mail ou senha inválidos." })
    }

    const { data, error: userError } = await supabase.auth.getUser()
    const user = data.user
    if (userError || !user?.email_confirmed_at) {
      await supabase.auth.signOut({ scope: "local" })
      return json(401, { ok: false, message: "E-mail ou senha inválidos." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  return json(200, { ok: true, next: "/minha-conta" })
}
