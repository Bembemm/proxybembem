import { NextResponse, type NextRequest } from "next/server"

import { sanitizeCustomerLoginNext } from "../../../lib/server/customer-account-actions.ts"
import { resolvePublicSiteUrl } from "../../../lib/server/env.ts"
import { isPasswordRecoveryGrantActive } from "../../../lib/server/password-recovery-grant.ts"
import {
  RECOVERY_TOKEN_COOKIE,
  RECOVERY_TOKEN_MAX_AGE_SECONDS,
  isValidRecoveryTokenHash,
} from "../../../lib/server/password-recovery.ts"

function redirect(request: NextRequest, path: string) {
  const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
  const response = NextResponse.redirect(new URL(path, siteUrl), 303)
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = request.nextUrl.searchParams.get("type")
  const next = sanitizeCustomerLoginNext(
    request.nextUrl.searchParams.get("next"),
  )

  const recoveryErrorPath =
    `/entrar?erro=recovery&next=${encodeURIComponent(next)}`

  if (type !== "recovery" || !isValidRecoveryTokenHash(tokenHash)) {
    return redirect(request, recoveryErrorPath)
  }

  let active = false
  try {
    active = await isPasswordRecoveryGrantActive(tokenHash)
  } catch {
    return redirect(request, recoveryErrorPath)
  }

  if (!active) {
    return redirect(request, recoveryErrorPath)
  }

  const response = redirect(
    request,
    `/redefinir-senha?next=${encodeURIComponent(next)}`,
  )
  response.cookies.set(RECOVERY_TOKEN_COOKIE, tokenHash, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RECOVERY_TOKEN_MAX_AGE_SECONDS,
  })
  return response
}
