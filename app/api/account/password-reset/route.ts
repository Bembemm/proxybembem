import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
  parseAccountResetInput,
} from "../../../../lib/server/customer-account-actions.ts"
import {
  getSupabaseEnv,
  resolvePublicSiteUrl,
} from "../../../../lib/server/env.ts"
import {
  createPasswordRecoveryToken,
  issuePasswordRecoveryGrant,
} from "../../../../lib/server/password-recovery-grant.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { sendPasswordRecoveryEmail } from "../../../../lib/server/recovery-email.ts"
import { readJsonBody } from "../../../../lib/server/request-body.ts"

const RESET_MESSAGE =
  "Se o e-mail estiver cadastrado, enviaremos um link para redefinir sua senha."
const RESET_RATE_LIMIT_MESSAGE =
  "Muitas tentativas de envio. Aguarde alguns minutos e tente novamente."

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
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

  try {
    const env = getSupabaseEnv()
    const supabase = createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: input.email,
    })

    if (error) {
      if (typeof error.status !== "number" || error.status >= 500) {
        return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
      }
      return json(200, { ok: true, message: RESET_MESSAGE })
    }

    const userId = data.user?.id
    if (!userId) {
      return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
    }

    const recoveryToken = createPasswordRecoveryToken()
    await issuePasswordRecoveryGrant({ token: recoveryToken, userId })

    const recoveryUrl = new URL(
      "/auth/confirm",
      resolvePublicSiteUrl(request.nextUrl.origin),
    )
    recoveryUrl.searchParams.set("token_hash", recoveryToken)
    recoveryUrl.searchParams.set("type", "recovery")
    recoveryUrl.searchParams.set("next", input.next)

    await sendPasswordRecoveryEmail({
      to: input.email,
      recoveryUrl: recoveryUrl.toString(),
    })
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  return json(200, { ok: true, message: RESET_MESSAGE })
}
