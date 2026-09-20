import type { Metadata } from "next"
import Link from "next/link"
import { AccountPage } from "@/components/account/account-page"
import { buildWhatsAppOrderUrl } from "@/lib/checkout"
import {
  canResumeCheckout,
  checkoutExpiresAt,
  isCheckoutExpired,
} from "@/lib/checkout-expiration"
import { fulfillmentStatusLabel, paymentStatusLabel } from "@/lib/order-status-labels"
import { requireCustomerPageAccess } from "@/lib/server/customer-auth"
import {
  getOwnOrderById,
  type CustomerOrderTimelineEntry,
  type CustomerShipmentProjection,
  type CustomerShipmentTimelineEntry,
} from "@/lib/server/customer-orders"
import { getPublicStoreSettings } from "@/lib/server/store-settings-cache"

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

const SHIPMENT_STATUS_LABELS: Record<CustomerShipmentProjection["status"], string> = {
  preparing: "Preparando envio",
  posted: "Postado",
  in_transit: "Em trânsito",
  delivered: "Entregue",
  canceled: "Cancelado",
  attention: "Atenção",
}

const SHIPMENT_TIMELINE_LABELS: Record<CustomerShipmentTimelineEntry["kind"], string> = {
  posted: "Postado",
  in_transit: "Em trânsito",
  delivered: "Entregue",
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
  await requireCustomerPageAccess(`/minha-conta/pedidos/${id}`)
  let order: Awaited<ReturnType<typeof getOwnOrderById>>
  try {
    order = await getOwnOrderById(id)
  } catch {
    console.error("Customer order detail load failed", { orderId: id })
    return (
      <AccountPage
        title="Não foi possível carregar este pedido"
        description="Tente novamente. Se o problema continuar, acesse sua lista de pedidos."
      >
        <Link
          href="/minha-conta/pedidos"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          Ver meus pedidos
        </Link>
      </AccountPage>
    )
  }

  if (!order) {
    return (
      <AccountPage
        title="Pedido não encontrado"
        description="Este pedido não existe ou não está vinculado à sua conta."
      >
        <Link
          href="/minha-conta/pedidos"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          Ver meus pedidos
        </Link>
      </AccountPage>
    )
  }

  const checkoutExpired = isCheckoutExpired(order)
  const checkoutResumable = canResumeCheckout(order)
  const checkoutExpiration = checkoutExpiresAt(order.createdAt)

  const storeSettings = await getPublicStoreSettings()
  const supportUrl = buildWhatsAppOrderUrl(
    storeSettings.contactWhatsappE164,
    `Olá, gostaria de falar sobre o pedido ${order.orderNumber}`,
  )
  const listWhatsappUrl =
    order.paymentStatus === "approved" && order.fulfillmentStatus !== "canceled"
      ? buildWhatsAppOrderUrl(
          storeSettings.contactWhatsappE164,
          `Olá! Quero enviar a lista e as artes do pedido ${order.orderNumber}.

Vou mandar abaixo a lista/cartas, artes e observações do pedido.`,
        )
      : null
  const canRequestCancellation =
    !checkoutExpired &&
    !["shipped", "completed", "canceled"].includes(order.fulfillmentStatus)
  const cancellationUrl = canRequestCancellation
    ? buildWhatsAppOrderUrl(
        storeSettings.contactWhatsappE164,
        `Olá! Gostaria de solicitar o cancelamento do pedido ${order.orderNumber}. Poderia me orientar sobre os próximos passos?`,
      )
    : null
  const address = order.address
  const hasAddress = Boolean(
    address.street || address.number || address.neighborhood || address.city || address.state,
  )

  return (
    <AccountPage
      title={order.orderNumber}
      description={`Criado em ${new Date(order.createdAt).toLocaleDateString("pt-BR")}`}
      actions={supportUrl ? (
        <a
          href={supportUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          Falar sobre este pedido
        </a>
      ) : undefined}
    >
      <div className="space-y-6">
        {checkoutResumable ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
              Pagamento pendente
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">Finalize o pagamento deste pedido</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              O pedido já foi reservado, mas o pagamento ainda não foi concluído. Você pode continuar
              no Mercado Pago até {checkoutExpiration.toLocaleString("pt-BR")}.
            </p>
            <a
              href={`/api/orders/${order.id}/resume-payment`}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:w-auto"
            >
              Continuar pagamento
            </a>
          </section>
        ) : checkoutExpired ? (
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">
              Checkout expirado
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">Pagamento não concluído</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              O prazo deste checkout terminou sem confirmação de pagamento. O registro fica apenas
              no histórico da sua conta e não entra em produção.
            </p>
            <Link
              href="/produtos"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-violet-300 hover:text-violet-700"
            >
              Fazer um novo pedido
            </Link>
          </section>
        ) : null}

        {listWhatsappUrl ? (
          <section
            aria-labelledby="order-list-title"
            className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-violet-50/70 p-5 shadow-sm sm:p-6"
          >
            <div className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">
              Envio da lista
            </div>
            <h2 id="order-list-title" className="mt-4 text-xl font-bold text-slate-950 sm:text-2xl">
              Envie sua lista e artes
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Envie sua lista de cartas, link do Moxfield ou LigaMagic, artes e observações do pedido pelo WhatsApp.
            </p>
            <a
              href={listWhatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:w-auto"
            >
              Enviar lista / artes no WhatsApp
            </a>
            <p className="mt-3 text-xs leading-5 text-slate-500 sm:text-sm">
              Você também pode mandar preferências de idioma, versões das cartas e outras observações importantes.
            </p>
          </section>
        ) : null}

        {cancellationUrl ? (
          <section className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Precisa cancelar?</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Envie uma solicitação pelo WhatsApp. O pedido não é cancelado automaticamente e,
                se houver pagamento, o reembolso é tratado separadamente.
              </p>
            </div>
            <a
              href={cancellationUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
            >
              Solicitar cancelamento
            </a>
          </section>
        ) : null}

        <section aria-label="Status do pedido" className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagamento</p>
            <p className="mt-1 font-semibold text-slate-950">
              {checkoutExpired ? "Expirado — não pago" : paymentStatusLabel(order.paymentStatus)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Produção</p>
            <p className="mt-1 font-semibold text-slate-950">
              {checkoutExpired ? "Não iniciada" : fulfillmentStatusLabel(order.fulfillmentStatus)}
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-bold text-slate-950 sm:text-xl">Itens</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {order.items.map((item) => (
              <div key={`${item.productId}-${item.title}`} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-semibold text-slate-950">{item.title}</p>
                  <p className="text-sm text-slate-500">Quantidade: {item.quantity}</p>
                </div>
                <p className="text-sm font-semibold text-slate-700">{formatMoney(item.unitPriceCents * item.quantity)}</p>
              </div>
            ))}
          </div>
          <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Produtos</dt><dd>{formatMoney(order.subtotalCents)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Frete</dt><dd>{formatMoney(order.shippingCents)}</dd></div>
            <div className="flex justify-between gap-4 text-base font-bold text-slate-950"><dt>Total</dt><dd>{formatMoney(order.totalCents ?? order.subtotalCents)}</dd></div>
          </dl>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
            <h2 className="text-lg font-bold text-slate-950 sm:text-xl">Entrega</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p className="font-semibold text-slate-950">
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

            {order.shipment ? (
              <div className="mt-5 border-t border-slate-200 pt-5">
                <h3 className="text-base font-bold text-slate-950">Rastreamento</h3>
                <p className="mt-2 font-semibold text-slate-950">
                  {SHIPMENT_STATUS_LABELS[order.shipment.status]}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {order.shipment.carrierName} — {order.shipment.serviceName}
                </p>
                {order.shipment.trackingCode ? (
                  <p className="mt-1 text-sm text-slate-600">
                    Código: <span className="font-mono font-semibold text-slate-800">{order.shipment.trackingCode}</span>
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  Atualizado em {new Date(order.shipment.updatedAt).toLocaleString("pt-BR")}
                </p>
                {order.shipment.timeline.length > 0 ? (
                  <ol className="mt-4 space-y-2">
                    {order.shipment.timeline.map((entry) => (
                      <li key={`${entry.kind}-${entry.createdAt}`} className="border-l-2 border-violet-200 pl-3">
                        <p className="font-semibold text-slate-800">{SHIPMENT_TIMELINE_LABELS[entry.kind]}</p>
                        <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">Ainda não há eventos públicos de rastreamento.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="text-lg font-bold text-slate-950 sm:text-xl">Histórico</h2>
            {order.timeline.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">Ainda não há atualizações públicas neste pedido.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {order.timeline.map((entry, index) => (
                  <li key={`${entry.kind}-${entry.createdAt}-${index}`} className="border-l-2 border-violet-200 pl-3">
                    <p className="font-semibold text-slate-950">{TIMELINE_LABELS[entry.kind]}</p>
                    <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </AccountPage>
  )
}
