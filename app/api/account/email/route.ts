import { type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
  parseAccountEmailChangeInput,
} from "../../../../lib/server/customer-account-actions.ts"
import { requireCustomerPageAccess } from "../../../../lib/server/customer-auth.ts"
import { resolvePublicSiteUrl } from "../../../../lib/server/env.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../lib/server/request-body.ts"
import { createSupabaseAuthServerClient } from "../../../../lib/supabase/auth-server.ts"
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
    if (!(await consumeRateLimit({ request, scope: "account-email-change" }))) {
      return json(429, { ok: false, message: "Tente novamente em alguns minutos." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  const identity = await requireCustomerPageAccess()

  let input: ReturnType<typeof parseAccountEmailChangeInput>
  try {
    input = parseAccountEmailChangeInput(await readJsonBody(request, 4_096))
  } catch {
    return json(400, { ok: false, message: "Dados inválidos." })
  }

  if (input.email === identity.email) {
    return json(400, { ok: false, message: "Informe um e-mail diferente do atual." })
  }

  try {
    const verifier = createSupabaseAuthServerClient()
    const { error: credentialError } = await verifier.auth.signInWithPassword({
      email: identity.email,
      password: input.currentPassword,
    })
    if (credentialError) {
      return json(400, { ok: false, message: "Senha atual inválida." })
    }

    const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
    const emailRedirectTo = new URL(
      "/auth/callback?next=/minha-conta/seguranca",
      siteUrl,
    ).toString()

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.updateUser(
      { email: input.email },
      { emailRedirectTo },
    )
    if (error) {
      return json(400, {
        ok: false,
        message: "Não foi possível solicitar a alteração do e-mail.",
      })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  return json(200, {
    ok: true,
    message: "Solicitação enviada. Confira seu e-mail para concluir a alteração.",
  })
}
