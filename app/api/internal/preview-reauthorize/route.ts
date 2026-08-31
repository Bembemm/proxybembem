import { NextRequest } from "next/server"
import { POST as oauthStartPost } from "@/app/api/internal/melhor-envio/oauth/start/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response(null, { status: 404 })
  }

  const adminSecret = process.env.MELHOR_ENVIO_OAUTH_ADMIN_SECRET?.trim()
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (!adminSecret || !configuredOrigin) {
    return Response.json({ ok: false, error: "preview_config_unavailable" }, { status: 503 })
  }

  const origin = new URL(configuredOrigin).origin
  const body = new URLSearchParams({ adminSecret }).toString()
  const request = new NextRequest(`${origin}/api/internal/melhor-envio/oauth/start`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
      "x-forwarded-for": "198.51.100.30",
    },
    body,
  })

  const response = await oauthStartPost(request)
  const location = response.headers.get("location")

  if (response.status !== 303 || !location) {
    return Response.json(
      { ok: false, error: "oauth_start_failed", status: response.status },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  })
}