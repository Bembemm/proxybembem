import { type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
  parseAccountLoginInput,
} from "../../../../lib/server/customer-account-actions.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../lib/server/request-body.ts"
import { createSupabaseAuthServerClient } from "../../../../lib/supabase/auth-server.ts"

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
    const supabase = createSupabaseAuthServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    })
    const session = data.session
    if (error || !session?.access_token || !session.refresh_token) {
      return json(401, { ok: false, message: "E-mail ou senha inválidos." })
    }

    const { data: verified, error: userError } = await supabase.auth.getUser(
      session.access_token,
    )
    if (userError || !verified.user?.email_confirmed_at) {
      return json(401, { ok: false, message: "E-mail ou senha inválidos." })
    }

    return json(200, {
      ok: true,
      next: "/minha-conta",
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    })
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }
}
