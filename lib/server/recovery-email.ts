const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails"
const RECOVERY_FROM = "ProxyBembem <noreply@proxybembem.com.br>"
const PROVIDER_TIMEOUT_MS = 10_000

function requiredResendApiKey() {
  const value = process.env.RESEND_API_KEY?.trim()
  if (!value) {
    throw new Error("Missing recovery email provider configuration")
  }
  return value
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function validatedRecoveryUrl(rawUrl: string) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error("Invalid recovery URL")
  }

  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("Production recovery URL must use HTTPS")
  }

  return url.toString()
}

export async function sendPasswordRecoveryEmail(input: {
  to: string
  recoveryUrl: string
}) {
  const apiKey = requiredResendApiKey()
  const recoveryUrl = validatedRecoveryUrl(input.recoveryUrl)
  const safeUrl = escapeHtml(recoveryUrl)

  const response = await fetch(RESEND_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RECOVERY_FROM,
      to: [input.to],
      subject: "Redefina sua senha da ProxyBembem",
      text: `Recebemos uma solicitação para redefinir sua senha. Abra este link para continuar: ${recoveryUrl}\n\nSe você não solicitou a alteração, ignore este e-mail.`,
      html: `<p>Recebemos uma solicitação para redefinir sua senha.</p><p><a href="${safeUrl}">Redefinir senha</a></p><p>Se você não solicitou a alteração, ignore este e-mail.</p>`,
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error("Recovery email provider request failed")
  }
}
