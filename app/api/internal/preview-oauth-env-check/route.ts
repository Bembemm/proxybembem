import { getMelhorEnvioOAuthEnv } from "@/lib/server/env"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const REQUIRED = [
  "MELHOR_ENVIO_ENVIRONMENT",
  "MELHOR_ENVIO_CLIENT_ID",
  "MELHOR_ENVIO_CLIENT_SECRET",
  "MELHOR_ENVIO_REDIRECT_URI",
  "MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY",
  "MELHOR_ENVIO_OAUTH_ADMIN_SECRET",
  "MELHOR_ENVIO_USER_AGENT",
  "SHIPPING_ORIGIN_CEP",
  "SHIPPING_QUOTE_SECRET",
] as const

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ ok: false, error: "not_preview" }, { status: 404 })
  }

  const missing = REQUIRED.filter((name) => !process.env[name]?.trim())
  let configOk = false
  let errorType: string | null = null
  let errorHint: string | null = null

  try {
    getMelhorEnvioOAuthEnv()
    configOk = true
  } catch (error) {
    errorType = error instanceof Error ? error.name : "unknown"
    const message = error instanceof Error ? error.message : ""
    if (message.startsWith("Missing required server environment variable: ")) {
      errorHint = message.replace("Missing required server environment variable: ", "missing:")
    } else if (message.startsWith("MELHOR_ENVIO_")) {
      errorHint = message.split(" ")[0]
    } else if (message.startsWith("Production MELHOR_ENVIO_REDIRECT_URI")) {
      errorHint = "MELHOR_ENVIO_REDIRECT_URI"
    }
  }

  return Response.json(
    {
      ok: true,
      configOk,
      missing,
      errorType,
      errorHint,
      tokenEncryptionKeyShapeOk: /^[0-9a-fA-F]{64}$/.test(
        process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY?.trim() ?? "",
      ),
      oauthAdminSecretLengthOk:
        (process.env.MELHOR_ENVIO_OAUTH_ADMIN_SECRET?.trim().length ?? 0) >= 32,
      redirectUriIsAbsolute: (() => {
        try {
          new URL(process.env.MELHOR_ENVIO_REDIRECT_URI?.trim() ?? "")
          return true
        } catch {
          return false
        }
      })(),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
