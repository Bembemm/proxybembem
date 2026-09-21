"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

interface PaymentReturnReconcilerProps {
  orderId: string
  resumeHref: string
}

const RETRY_DELAYS_MS = [0, 4_000, 6_000, 8_000, 10_000] as const

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
}

export function PaymentReturnReconciler({
  orderId,
  resumeHref,
}: PaymentReturnReconcilerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [waiting, setWaiting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function reconcile() {
      for (const delay of RETRY_DELAYS_MS) {
        if (delay > 0) await sleep(delay)
        if (cancelled) return

        try {
          const response = await fetch(
            `/api/orders/${encodeURIComponent(orderId)}/reconcile-payment`,
            {
              method: "POST",
              headers: { Accept: "application/json" },
              cache: "no-store",
              credentials: "same-origin",
            },
          )

          if (response.status === 401) {
            router.refresh()
            return
          }

          const payload = (await response.json().catch(() => null)) as
            | { state?: unknown }
            | null
          const state =
            payload && typeof payload.state === "string" ? payload.state : null

          if (
            response.ok &&
            (state === "approved" ||
              state === "manual_review" ||
              state === "final")
          ) {
            router.replace(pathname, { scroll: false })
            router.refresh()
            return
          }

          if (response.status === 429) break
        } catch {
          // A later attempt may succeed; webhook delivery remains authoritative too.
        }
      }

      if (!cancelled) setWaiting(true)
    }

    void reconcile()

    return () => {
      cancelled = true
    }
  }, [orderId, pathname, router])

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
        {waiting ? "Aguardando confirmação" : "Verificando pagamento"}
      </p>
      <h2 className="mt-2 text-xl font-bold text-slate-950">
        {waiting
          ? "Seu pagamento pode ainda estar sendo confirmado"
          : "Estamos conferindo seu pagamento no Mercado Pago"}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
        {waiting
          ? "Se você já realizou o pagamento, não pague novamente. A confirmação pode levar alguns minutos e o pedido será atualizado automaticamente quando o Mercado Pago confirmar."
          : "Se você já realizou o pagamento, não pague novamente. Vamos verificar por alguns instantes e atualizar esta página automaticamente quando houver confirmação."}
      </p>

      {waiting ? (
        <>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700">
            Caso você ainda não tenha concluído o pagamento, use o botão abaixo
            para voltar ao checkout.
          </p>
          <a
            href={resumeHref}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:w-auto"
          >
            Ir para o Mercado Pago
          </a>
        </>
      ) : (
        <p className="mt-4 text-sm font-semibold text-amber-900">
          Verificando automaticamente…
        </p>
      )}
    </section>
  )
}
