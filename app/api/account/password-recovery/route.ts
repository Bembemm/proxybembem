import { NextResponse, type NextRequest } from "next/server"
import {
  CustomerPasswordPolicyError,
  isSameOriginAccountRequest,
  parseAccountPasswordUpdateInput,
} from "../../../../lib/server/customer-account-actions.ts"
import {
  claimPasswordRecoveryGrant,
  createPasswordRecoveryAdminClient,
  finishPasswordRecoveryGrant,
  isValidPasswordRecoveryToken,
} from "../../../../lib/server/password-recovery-grant.ts"
import {
  RECOVERY_TOKEN_COOKIE,
  clearedRecoveryTokenCookieOptions,
} from "../../../../lib/server/password-recovery.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../lib/server/request-body.ts"

const INVALID_RECOVERY_MESSAGE = "Link de recuperação inválido ou expirado."
const BUSY_RECOVERY_MESSAGE =
  "Já existe uma tentativa de recuperação em andamento. Aguarde alguns segundos e tente novamente."

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

async function releaseRecoveryGrant(token: string, leaseId: string) {
  try {
    return await finishPasswordRecoveryGrant({ token, leaseId, success: false })
  } catch {
    return false
  }
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
  } catch (error) {
    if (error instanceof CustomerPasswordPolicyError) {
      return json(400, { ok: false, message: error.message })
    }
    return json(400, { ok: false, message: "Nova senha inválida." })
  }

  const token = request.cookies.get(RECOVERY_TOKEN_COOKIE)?.value
  if (!isValidPasswordRecoveryToken(token)) {
    return clearRecoveryTokenCookie(
      json(401, { ok: false, message: INVALID_RECOVERY_MESSAGE }),
    )
  }

  let claim: Awaited<ReturnType<typeof claimPasswordRecoveryGrant>>
  try {
    claim = await claimPasswordRecoveryGrant(token)
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  if (claim.status === "invalid") {
    return clearRecoveryTokenCookie(
      json(401, { ok: false, message: INVALID_RECOVERY_MESSAGE }),
    )
  }
  if (claim.status === "busy") {
    return json(409, { ok: false, message: BUSY_RECOVERY_MESSAGE })
  }

  let updateError: { status?: number } | null = null
  try {
    const supabase = createPasswordRecoveryAdminClient()
    const result = await supabase.auth.admin.updateUserById(claim.userId, {
      password: input.password,
    })
    updateError = result.error
  } catch {
    await releaseRecoveryGrant(token, claim.leaseId)
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  if (updateError) {
    const released = await releaseRecoveryGrant(token, claim.leaseId)
    if (!released) {
      return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
    }

    const status =
      typeof updateError.status === "number" && updateError.status < 500 ? 400 : 503
    return json(status, {
      ok: false,
      message:
        status === 400
          ? "Não foi possível redefinir a senha. Verifique a nova senha e tente novamente."
          : "Serviço temporariamente indisponível.",
    })
  }

  let consumed = false
  try {
    consumed = await finishPasswordRecoveryGrant({
      token,
      leaseId: claim.leaseId,
      success: true,
    })
  } catch {
    consumed = false
  }

  if (!consumed) {
    return clearRecoveryTokenCookie(
      json(503, {
        ok: false,
        message:
          "Senha redefinida, mas não foi possível finalizar a recuperação. Entre novamente com a nova senha.",
      }),
    )
  }

  return clearRecoveryTokenCookie(json(200, { ok: true }))
}
