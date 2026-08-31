import { getMelhorEnvioOAuthEnv } from "../../../../../lib/server/env.ts"

export const runtime = "nodejs"

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response(null, { status: 404 })
  }

  try {
    const env = getMelhorEnvioOAuthEnv()
    const redirect = new URL(env.redirectUri)
    return Response.json(
      {
        ok: true,
        environment: env.environment,
        redirectUri: env.redirectUri,
        redirectHost: redirect.host,
        redirectPath: redirect.pathname,
        clientIdPresent: env.clientId.length > 0,
        clientIdNumeric: /^\d+$/.test(env.clientId),
      },
      { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
    )
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
