import { NextResponse, type NextRequest } from "next/server"

import { resolvePublicSiteUrl } from "../../../lib/server/env.ts"
import {
  RECOVERY_TOKEN_COOKIE,
  RECOVERY_TOKEN_MAX_AGE_SECONDS,
  isValidRecoveryTokenHash,
} from "../../../lib/server/password-recovery.ts"

function redirect(request: NextRequest, path: string) {
  const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
  const response = NextResponse.redirect(new URL(path, siteUrl), 303)
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = request.nextUrl.searchParams.get("type")

  if (type !== "recovery" || !isValidRecoveryTokenHash(tokenHash)) {
    return redirect(request, "/entrar?erro=recovery")
  }

  const response = redirect(request, "/redefinir-senha")
  response.cookies.set(RECOVERY_TOKEN_COOKIE, tokenHash, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RECOVERY_TOKEN_MAX_AGE_SECONDS,
  })
  return response
}
