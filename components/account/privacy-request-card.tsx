"use client"

import { useState } from "react"

import { buildWhatsAppOrderUrl } from "@/lib/checkout"

export function PrivacyRequestCard({
  contactWhatsappE164,
  email,
}: {
  contactWhatsappE164: string | null
  email: string
}) {
  const [confirmed, setConfirmed] = useState(false)
  const privacyUrl = buildWhatsAppOrderUrl(
    contactWhatsappE164,
    `Olá! Gostaria de solicitar a exclusão da minha conta ProxyBembem vinculada ao e-mail ${email}. Entendo que alguns registros de pedidos, pagamentos e entregas podem precisar ser mantidos quando necessário.`,
  )

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 sm:p-5">
      <h2 className="text-lg font-bold text-slate-950">Privacidade</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Você pode solicitar a exclusão da sua conta pelo WhatsApp. A solicitação não apaga
        automaticamente pedidos, pagamentos ou registros que precisem ser mantidos para suporte,
        segurança, contabilidade ou obrigações aplicáveis.
      </p>

      <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-slate-700">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-1 size-4 rounded border-slate-300 text-violet-600"
        />
        <span>
          Entendo que a exclusão da conta é uma solicitação de privacidade e que registros
          históricos necessários podem ser preservados.
        </span>
      </label>

      {privacyUrl ? (
        <a
          href={confirmed ? privacyUrl : undefined}
          aria-disabled={!confirmed}
          target="_blank"
          rel="noreferrer"
          className={[
            "mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
            confirmed
              ? "border-rose-300 bg-white text-rose-700 hover:bg-rose-100"
              : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
          ].join(" ")}
        >
          Solicitar exclusão da conta pelo WhatsApp
        </a>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          O WhatsApp de suporte está temporariamente indisponível.
        </p>
      )}
    </section>
  )
}
