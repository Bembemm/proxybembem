import { renderBrandedEmailHtml } from "./email-layout.ts"
import { sendResendEmail } from "./resend-client.ts"

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
  const result = await sendResendEmail({
    to: input.to,
    subject: "Redefina sua senha da ProxyBembem",
    text: `ProxyBembem\n\nRedefinição de senha\nRecebemos uma solicitação para redefinir sua senha. Abra este link para continuar: ${recoveryUrl}\n\nSe você não solicitou a alteração, ignore este e-mail. Sua senha atual continuará válida.\n\nEste é um e-mail de segurança da sua conta.`,
    html: renderBrandedEmailHtml({
      preheader: "Redefinição de senha da sua conta ProxyBembem",
      eyebrow: "Segurança da conta",
      title: "Redefinição de senha",
      message:
        "Recebemos uma solicitação para redefinir sua senha. Use o botão abaixo para criar uma nova senha com segurança.",
      contentHtml:
        '<div style="background:#1d1729;border:1px solid #332641;border-radius:12px;padding:16px 18px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#b7afc6;">Se você não solicitou esta alteração, ignore este e-mail. Sua senha atual continuará válida.</div>',
      buttonLabel: "Redefinir senha",
      buttonUrl: recoveryUrl,
      footerNote: "Este é um e-mail de segurança da sua conta ProxyBembem.",
    }),
  })

  if (result.outcome !== "accepted") {
    throw new Error("Recovery email provider request failed")
  }
}
