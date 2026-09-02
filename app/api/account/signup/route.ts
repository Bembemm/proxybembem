import { type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
  parseAccountSignupInput,
} from "../../../../lib/server/customer-account-actions.ts"
import { resolvePublicSiteUrl } from "../../../../lib/server/env.ts"
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
    if (!(await consumeRateLimit({ request, scope: "account-signup" }))) {
      return json(429, { ok: false, message: "Tente novamente em alguns minutos." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  let input: ReturnType<typeof parseAccountSignupInput>
  try {
    input = parseAccountSignupInput(await readJsonBody(request, 4_096))
  } catch {
    return json(400, { ok: false, message: "Dados de cadastro inválidos." })
  }

  let emailRedirectTo: string
  try {
    const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
    emailRedirectTo = new URL(
      "/auth/callback?next=/minha-conta",
      siteUrl,
    ).toString()
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  try {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo,
        data: {
          name: input.name,
          whatsapp: input.whatsapp,
        },
      },
    })
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  return json(202, {
    ok: true,
    message: "Cadastro recebido. Verifique seu e-mail para continuar.",
  })
}
