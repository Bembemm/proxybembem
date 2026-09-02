import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { buildWhatsAppOrderUrl } from "@/lib/checkout"
import {
  getOwnOrderById,
  type CustomerOrderTimelineEntry,
} from "@/lib/server/customer-orders"

export const metadata: Metadata = {
  title: "Detalhes do pedido",
}

const TIMELINE_LABELS: Record<CustomerOrderTimelineEntry["kind"], string> = {
  payment_approved: "Pagamento aprovado",
  payment_reversed: "Pagamento revertido",
  production_started: "Produção iniciada",
  ready_to_ship: "Pronto para envio",
  shipped: "Enviado",
  completed: "Concluído",
  canceled: "Cancelado",
}

function formatMoney(cents: number | null) {
  if (cents === null) return "—"
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let order: Awaited<ReturnType<typeof getOwnOrderById>>
  try {
    order = await getOwnOrderById(id)
  } catch {
    notFound()
  }
  if (!order) notFound()

  const supportUrl = buildWhatsAppOrderUrl(
    `Olá, gostaria de falar sobre o pedido ${order.orderNumber}`,
  )
  const address = order.address
  const hasAddress = Boolean(
    address.street || address.number || address.neighborhood || address.city || address.state,
  )

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Pedido</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{order.orderNumber}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Criado em {new Date(order.createdAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <a
            href={supportUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg border border-violet-200 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
          >
            Falar sobre este pedido
          </a>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagamento</p>
            <p className="mt-1 font-semibold text-slate-900">{order.paymentStatus}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Produção</p>
            <p className="mt-1 font-semibold text-slate-900">{order.fulfillmentStatus}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-bold text-slate-900">Itens</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {order.items.map((item) => (
            <div key={`${item.productId}-${item.title}`} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="font-semibold text-slate-900">{item.title}</p>
                <p className="text-sm text-slate-500">Quantidade: {item.quantity}</p>
              </div>
              <p className="text-sm font-semibold text-slate-700">{formatMoney(item.unitPriceCents * item.quantity)}</p>
            </div>
          ))}
        </div>
        <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Produtos</dt><dd>{formatMoney(order.subtotalCents)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Frete</dt><dd>{formatMoney(order.shippingCents)}</dd></div>
          <div className="flex justify-between gap-4 text-base font-bold text-slate-900"><dt>Total</dt><dd>{formatMoney(order.totalCents ?? order.subtotalCents)}</dd></div>
        </dl>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-bold text-slate-900">Entrega</h2>
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">
              {[order.shippingCarrierName, order.shippingServiceName].filter(Boolean).join(" — ") || "Serviço de entrega"}
            </p>
            {order.shippingDeliveryDays !== null ? <p>Prazo estimado: {order.shippingDeliveryDays} dias</p> : null}
            {hasAddress ? (
              <address className="not-italic">
                {[address.street, address.number].filter(Boolean).join(", ")}
                {address.complement ? <><br />{address.complement}</> : null}
                {address.neighborhood ? <><br />{address.neighborhood}</> : null}
                {(address.city || address.state) ? <><br />{[address.city, address.state].filter(Boolean).join(" - ")}</> : null}
              </address>
            ) : (
              <p>Endereço não disponível para este pedido.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-bold text-slate-900">Histórico</h2>
          {order.timeline.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">Ainda não há atualizações públicas neste pedido.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {order.timeline.map((entry, index) => (
                <li key={`${entry.kind}-${entry.createdAt}-${index}`} className="border-l-2 border-violet-200 pl-3">
                  <p className="font-semibold text-slate-900">{TIMELINE_LABELS[entry.kind]}</p>
                  <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}
