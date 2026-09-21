const EMAIL_COLORS = {
  canvas: "#0b0912",
  card: "#15111f",
  panel: "#1d1729",
  border: "#332641",
  primary: "#8b5cf6",
  primaryDark: "#7c3aed",
  text: "#f5f3ff",
  muted: "#b7afc6",
  subtle: "#8f879f",
} as const

export function escapeEmailHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function renderBrandedEmailHtml(input: {
  preheader: string
  eyebrow?: string
  title: string
  message: string
  contentHtml?: string
  buttonLabel: string
  buttonUrl: string
  footerNote?: string
}) {
  const preheader = escapeEmailHtml(input.preheader)
  const eyebrow = input.eyebrow ? escapeEmailHtml(input.eyebrow) : ""
  const title = escapeEmailHtml(input.title)
  const message = escapeEmailHtml(input.message)
  const buttonLabel = escapeEmailHtml(input.buttonLabel)
  const buttonUrl = escapeEmailHtml(input.buttonUrl)
  const footerNote = escapeEmailHtml(
    input.footerNote ?? "Este é um e-mail transacional sobre a sua conta ou pedido.",
  )

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:${EMAIL_COLORS.canvas};font-family:Georgia,'Times New Roman',serif;color:${EMAIL_COLORS.text};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${EMAIL_COLORS.canvas};margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:${EMAIL_COLORS.card};border:1px solid ${EMAIL_COLORS.border};border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 20px;text-align:center;border-bottom:1px solid ${EMAIL_COLORS.border};">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:${EMAIL_COLORS.primary};font-weight:700;">◆ ProxyBembem ◆</div>
                <div style="margin:14px auto 0;width:72px;height:2px;background:${EMAIL_COLORS.primary};"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 12px;text-align:center;">
                ${eyebrow ? `<div style="display:inline-block;margin-bottom:14px;padding:7px 12px;border:1px solid ${EMAIL_COLORS.border};border-radius:999px;background:${EMAIL_COLORS.panel};font-family:Arial,sans-serif;font-size:11px;line-height:1;letter-spacing:1.4px;text-transform:uppercase;color:${EMAIL_COLORS.muted};font-weight:700;">${eyebrow}</div>` : ""}
                <h1 style="margin:0;font-size:30px;line-height:1.2;color:${EMAIL_COLORS.text};font-weight:700;">${title}</h1>
                <p style="margin:16px auto 0;max-width:520px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:${EMAIL_COLORS.muted};">${message}</p>
              </td>
            </tr>
            ${input.contentHtml ? `<tr><td style="padding:16px 28px 6px;">${input.contentHtml}</td></tr>` : ""}
            <tr>
              <td align="center" style="padding:24px 28px 34px;">
                <a href="${buttonUrl}" style="display:inline-block;background:${EMAIL_COLORS.primaryDark};color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;line-height:1;font-weight:700;padding:15px 24px;border-radius:10px;border:1px solid ${EMAIL_COLORS.primary};">${buttonLabel}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px;border-top:1px solid ${EMAIL_COLORS.border};text-align:center;">
                <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:${EMAIL_COLORS.subtle};">${footerNote}</p>
                <p style="margin:8px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:${EMAIL_COLORS.subtle};">proxybembem.com.br</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function renderEmailPanel(content: string) {
  return `<div style="background:${EMAIL_COLORS.panel};border:1px solid ${EMAIL_COLORS.border};border-radius:12px;padding:18px 20px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:${EMAIL_COLORS.muted};">${content}</div>`
}

export const EMAIL_MUTED_TEXT = EMAIL_COLORS.muted
export const EMAIL_TEXT = EMAIL_COLORS.text
export const EMAIL_PRIMARY = EMAIL_COLORS.primary
