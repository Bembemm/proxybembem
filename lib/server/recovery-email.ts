import { sendResendEmail } from "./resend-client.ts"

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
  const recoveryUrl = validatedRecoveryUrl(input.recoveryUrl)
  const safeUrl = escapeHtml(recoveryUrl)

  const result = await sendResendEmail({
    to: input.to,
    subject: "Redefina sua senha da ProxyBembem",
    text: `Recebemos uma solicitação para redefinir sua senha. Abra este link para continuar: ${recoveryUrl}\n\nSe você não solicitou a alteração, ignore este e-mail.`,
    html: `<p>Recebemos uma solicitação para redefinir sua senha.</p><p><a href="${safeUrl}">Redefinir senha</a></p><p>Se você não solicitou a alteração, ignore este e-mail.</p>`,
  })

  if (result.outcome !== "accepted") {
    throw new Error("Recovery email provider request failed")
  }
}
