import { type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
  parseAccountResetInput,
} from "../../../../lib/server/customer-account-actions.ts"
import { resolvePublicSiteUrl } from "../../../../lib/server/env.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../lib/server/request-body.ts"
import { createSupabaseAuthServerClient } from "../../../../lib/supabase/auth-server.ts"

const NEUTRAL_MESSAGE =
  "Se existir um cadastro pendente para esse e-mail, enviaremos uma nova confirmação."

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
    if (!(await consumeRateLimit({ request, scope: "account-confirmation-resend" }))) {
      return json(429, { ok: false, message: "Tente novamente em alguns minutos." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  let input: ReturnType<typeof parseAccountResetInput>
  try {
    input = parseAccountResetInput(await readJsonBody(request, 4_096))
  } catch {
    return json(400, { ok: false, message: "Informe um e-mail válido." })
  }

  try {
    const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
    const emailRedirectTo = new URL(
      "/auth/callback?next=/minha-conta",
      siteUrl,
    ).toString()
    const supabase = createSupabaseAuthServerClient()
    await supabase.auth.resend({
      type: "signup",
      email: input.email,
      options: { emailRedirectTo },
    })
  } catch {
    // Keep the response neutral so the endpoint cannot be used to enumerate accounts.
  }

  return json(200, { ok: true, message: NEUTRAL_MESSAGE })
}
