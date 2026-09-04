import { type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
  parseAccountResetInput,
} from "../../../../lib/server/customer-account-actions.ts"
import { resolvePublicSiteUrl } from "../../../../lib/server/env.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../lib/server/request-body.ts"
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts"

const RESET_MESSAGE =
  "Se o e-mail estiver cadastrado, enviaremos um link para redefinir sua senha."
const RESET_RATE_LIMIT_MESSAGE =
  "Muitas tentativas de envio. Aguarde alguns minutos e tente novamente."

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
    if (!(await consumeRateLimit({ request, scope: "account-password-reset" }))) {
      return json(429, { ok: false, message: RESET_RATE_LIMIT_MESSAGE })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  let input: ReturnType<typeof parseAccountResetInput>
  try {
    input = parseAccountResetInput(await readJsonBody(request, 4_096))
  } catch {
    return json(400, { ok: false, message: "E-mail inválido." })
  }

  let redirectTo: string
  try {
    const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
    redirectTo = new URL(
      `/auth/callback?next=${encodeURIComponent("/redefinir-senha")}`,
      siteUrl,
    ).toString()
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, { redirectTo })
    if (error) {
      if (error.status === 429) {
        return json(429, { ok: false, message: RESET_RATE_LIMIT_MESSAGE })
      }
      if (typeof error.status !== "number" || error.status >= 500) {
        return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
      }

      return json(200, { ok: true, message: RESET_MESSAGE })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  return json(200, { ok: true, message: RESET_MESSAGE })
}
