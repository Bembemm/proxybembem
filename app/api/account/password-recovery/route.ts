import { NextResponse, type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
  parseAccountPasswordUpdateInput,
} from "../../../../lib/server/customer-account-actions.ts"
import {
  RECOVERY_TOKEN_COOKIE,
  clearedRecoveryTokenCookieOptions,
  hasRecentRecoveryAmr,
  isValidRecoveryTokenHash,
} from "../../../../lib/server/password-recovery.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../lib/server/request-body.ts"
import { createSupabaseRouteClient } from "../../../../lib/supabase/route.ts"

const INVALID_RECOVERY_MESSAGE = "Link de recuperação inválido ou expirado."

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

function clearRecoveryTokenCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(RECOVERY_TOKEN_COOKIE, "", clearedRecoveryTokenCookieOptions())
  return response
}

export async function POST(request: NextRequest) {
  if (!isSameOriginAccountRequest(request)) {
    return json(403, { ok: false, message: "Requisição inválida." })
  }

  try {
    if (!(await consumeRateLimit({ request, scope: "account-password-recovery" }))) {
      return json(429, { ok: false, message: "Tente novamente em alguns minutos." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  let input: ReturnType<typeof parseAccountPasswordUpdateInput>
  try {
    input = parseAccountPasswordUpdateInput(await readJsonBody(request, 4_096))
  } catch {
    return json(400, { ok: false, message: "Nova senha inválida." })
  }

  let applyToResponse = <T extends NextResponse>(response: T) => response

  try {
    const routeClient = createSupabaseRouteClient(request)
    applyToResponse = routeClient.applyToResponse
    const tokenHash = request.cookies.get(RECOVERY_TOKEN_COOKIE)?.value

    if (tokenHash !== undefined) {
      if (!isValidRecoveryTokenHash(tokenHash)) {
        return applyToResponse(
          clearRecoveryTokenCookie(json(401, { ok: false, message: INVALID_RECOVERY_MESSAGE })),
        )
      }

      const { error: verifyError } = await routeClient.supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      })
      if (verifyError) {
        return applyToResponse(
          clearRecoveryTokenCookie(json(401, { ok: false, message: INVALID_RECOVERY_MESSAGE })),
        )
      }
    } else {
      const { data: claimsData, error: claimsError } = await routeClient.supabase.auth.getClaims()
      if (claimsError || !hasRecentRecoveryAmr(claimsData?.claims)) {
        return applyToResponse(
          clearRecoveryTokenCookie(json(401, { ok: false, message: INVALID_RECOVERY_MESSAGE })),
        )
      }

      const { data: userData, error: userError } = await routeClient.supabase.auth.getUser()
      if (userError || !userData.user?.email_confirmed_at) {
        return applyToResponse(
          clearRecoveryTokenCookie(json(401, { ok: false, message: INVALID_RECOVERY_MESSAGE })),
        )
      }
    }

    const { error: updateError } = await routeClient.supabase.auth.updateUser({
      password: input.password,
    })
    if (updateError) {
      return applyToResponse(
        clearRecoveryTokenCookie(
          json(400, { ok: false, message: "Não foi possível redefinir a senha." }),
        ),
      )
    }

    const { error: signOutError } = await routeClient.supabase.auth.signOut({ scope: "global" })
    if (signOutError) {
      return applyToResponse(
        clearRecoveryTokenCookie(
          json(503, {
            ok: false,
            message:
              "Senha redefinida, mas não foi possível encerrar todas as sessões. Entre novamente.",
          }),
        ),
      )
    }
  } catch {
    return applyToResponse(
      clearRecoveryTokenCookie(
        json(503, { ok: false, message: "Serviço temporariamente indisponível." }),
      ),
    )
  }

  return applyToResponse(clearRecoveryTokenCookie(json(200, { ok: true })))
}
