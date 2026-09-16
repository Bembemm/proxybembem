import { AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react"
import { notFound } from "next/navigation"
import { AdminShell } from "../../../../components/admin/admin-shell.tsx"
import { DangerConfirmForm } from "../../../../components/admin/danger-confirm-form.tsx"
import { OrderNotificationHistory } from "../../../../components/admin/order-notification-history.tsx"
import { ShipmentPanel } from "../../../../components/admin/shipment-panel.tsx"
import {
  FulfillmentStatusBadge,
  PaymentStatusBadge,
} from "../../../../components/admin/status-badge.tsx"
import { listAdminAuditForEntity } from "../../../../lib/server/admin-audit.ts"
import { requireAdminPageAccess } from "../../../../lib/server/admin-auth.ts"
import { listAdminOrderNotifications } from "../../../../lib/server/admin-order-notifications.ts"
import { getAdminOrderById } from "../../../../lib/server/admin-orders.ts"
import {
  allowedAdminFulfillmentTransitions,
  type FulfillmentStatus,
} from "../../../../lib/server/fulfillment.ts"
import { listOpenOrderAttention } from "../../../../lib/server/order-attention.ts"
import { listOrderEvents } from "../../../../lib/server/order-events.ts"
import { getAdminShipmentProjectionForOrder } from "../../../../lib/server/shipments.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const FEEDBACK_MESSAGES = {
  updated: "Pedido atualizado com sucesso.",
  unchanged: "O pedido já estava nesse status.",
  "invalid-transition": "Essa transição não está mais disponível para o pedido.",
  "payment-required": "Pagamento aprovado é necessário para iniciar a produção.",
} as const

const SHIPMENT_FEEDBACK_MESSAGES = {
  prepared: "Remessa preparada com sucesso e adicionada ao carrinho do Melhor Envio.",
  "sender-missing": "Cadastre um remetente válido do Melhor Envio antes de preparar a remessa.",
  "shipment-invalid": "Os dados da remessa estão incompletos. Verifique o CPF do destinatário, endereço, serviço de frete e dados do remetente.",
  "recipient-same-as-sender": "O CPF do destinatário deve ser diferente do CPF do remetente para preparar a remessa.",
  "shipment-busy": "Já existe uma operação de remessa em andamento. Atualize a página antes de tentar novamente.",
  "provider-rejected": "O Melhor Envio recusou esta operação. Revise os dados da remessa antes de tentar novamente.",
  "reauthorization-required": "A integração com o Melhor Envio precisa ser reautorizada antes de continuar.",
  "shipment-attention": "A remessa precisa de verificação manual antes de continuar.",
  purchased: "Compra da etiqueta confirmada pelo Melhor Envio.",
  "price-changed": "O custo atual da etiqueta mudou. Revise o novo valor antes de confirmar a compra.",
  "reconciled-purchased": "A reconciliação confirmou que a etiqueta foi comprada.",
  "reconciled-not-purchased": "A reconciliação confirmou que a etiqueta não foi comprada e a remessa voltou a um estado seguro.",
} as const

const NOTIFICATION_FEEDBACK_MESSAGES = {
  resent: "Reenvio de e-mail adicionado à fila.",
  "resend-conflict": "Já existe um reenvio desse e-mail aguardando processamento.",
  "resend-not-ready": "Esse e-mail ainda está em processamento ou aguardando nova tentativa.",
} as const

const PAYMENT_REQUIRED_COPY =
  "O pagamento aprovado é necessário para iniciar a produção. Verifique o status confirmado pelo Mercado Pago antes de continuar."
const CANCELLATION_COPY =
  "Cancelar o pedido altera apenas o estado operacional: isso não reembolsa automaticamente o Mercado Pago. Se o pedido já estiver pago, o acompanhamento financeiro continua até a reversão ser confirmada pelo provedor."

type FeedbackStatus = keyof typeof FEEDBACK_MESSAGES
type ShipmentFeedbackStatus = keyof typeof SHIPMENT_FEEDBACK_MESSAGES
type NotificationFeedbackStatus = keyof typeof NOTIFICATION_FEEDBACK_MESSAGES

type PageParams = Promise<{ id: string }>
type PageSearchParams = Promise<{
  status?: string | string[]
  shipment?: string | string[]
  notification?: string | string[]
}>

export const dynamic = "force-dynamic"

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function feedbackMessage(value: string | undefined) {
  if (!value || !(value in FEEDBACK_MESSAGES)) return null
  return FEEDBACK_MESSAGES[value as FeedbackStatus]
}

function shipmentFeedbackMessage(value: string | undefined) {
  if (!value || !(value in SHIPMENT_FEEDBACK_MESSAGES)) return null
  return SHIPMENT_FEEDBACK_MESSAGES[value as ShipmentFeedbackStatus]
}

function notificationFeedbackMessage(value: string | undefined) {
  if (!value || !(value in NOTIFICATION_FEEDBACK_MESSAGES)) return null
  return NOTIFICATION_FEEDBACK_MESSAGES[value as NotificationFeedbackStatus]
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100)
}

function formatLocalDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function displayValue(value: string | null | undefined) {
  return value && value.trim() ? value : "—"
}

function whatsappHref(value: string) {
  const digits = value.replace(/\D/g, "")
  return digits ? `https://wa.me/${digits}` : null
}

function ActionForm({
  action,
  label,
  emphasis = false,
}: {
  action: string
  label: string
  emphasis?: boolean
}) {
  return (
    <form method="post" action={action}>
      <button
        type="submit"
        className={
          emphasis
            ? "inline-flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:w-auto"
            : "inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:w-auto"
        }
      >
        {label}
      </button>
    </form>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function actionForTarget(target: FulfillmentStatus) {
  switch (target) {
    case "in_production":
      return { route: "start-production", label: "Iniciar produção" }
    case "ready_to_ship":
      return { route: "mark-ready-to-ship", label: "Marcar pronto para envio" }
    case "shipped":
      return { route: "mark-shipped", label: "Marcar enviado" }
    case "completed":
      return { route: "mark-completed", label: "Marcar concluído" }
    case "canceled":
      return { route: "cancel", label: "Cancelar pedido" }
    case "awaiting_payment":
    case "awaiting_production":
      return null
  }
}

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: PageSearchParams
}) {
  await requireAdminPageAccess({ touch: true })

  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const order = await getAdminOrderById(id)
  if (!order) notFound()

  const [events, attention, audit, shipment, notifications] = await Promise.all([
    listOrderEvents(id),
    listOpenOrderAttention(id),
    listAdminAuditForEntity({ entityType: "order", entityId: id }),
    getAdminShipmentProjectionForOrder(id),
    listAdminOrderNotifications(id),
  ])

  const query = await searchParams
  const feedback =
    notificationFeedbackMessage(firstParam(query.notification)) ??
    shipmentFeedbackMessage(firstParam(query.shipment)) ??
    feedbackMessage(firstParam(query.status))
  const transitions = allowedAdminFulfillmentTransitions(order.fulfillment_status)
  const paymentApproved = order.payment_status === "approved"
  const totalCents = order.total_cents ?? order.subtotal_cents
  const whatsapp = whatsappHref(order.whatsapp)

  return (
    <AdminShell
      activeSection="orders"
      title={`Pedido ${order.order_number}`}
      description="Detalhes operacionais, produção, pagamento e histórico do pedido em uma visão protegida."
    >
      <div className="space-y-5">
        <a
          href="/admin/pedidos"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-violet-700"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para pedidos
        </a>

        {feedback ? (
          <p
            role="status"
            className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-800"
          >
            {feedback}
          </p>
        ) : null}

        <Section title="Resumo do pedido">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField label="Pedido" value={order.order_number} />
            <DetailField label="Criado em" value={formatLocalDate(order.created_at)} />
            <DetailField label="Total" value={formatMoney(totalCents)} />
            <DetailField
              label="Status"
              value={
                <div className="flex flex-wrap gap-2">
                  <PaymentStatusBadge value={order.payment_status} />
                  <FulfillmentStatusBadge value={order.fulfillment_status} />
                </div>
              }
            />
          </div>
        </Section>

        <Section
          title="Produção"
          description="As ações abaixo alteram somente o fluxo operacional. O banco revalida cada transição sob lock."
        >
          {order.fulfillment_status === "awaiting_production" && !paymentApproved ? (
            <div className="mb-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{PAYMENT_REQUIRED_COPY}</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {transitions.map((target) => {
              const action = actionForTarget(target)
              if (!action) return null
              if (target === "in_production" && !paymentApproved) return null

              if (target === "in_production") {
                return (
                  <ActionForm
                    key={target}
                    action={`/api/internal/admin/orders/${order.id}/start-production`}
                    label="Iniciar produção"
                    emphasis
                  />
                )
              }
              if (target === "ready_to_ship") {
                return (
                  <ActionForm
                    key={target}
                    action={`/api/internal/admin/orders/${order.id}/mark-ready-to-ship`}
                    label="Marcar pronto para envio"
                    emphasis
                  />
                )
              }
              if (target === "shipped") {
                if (order.shipping_provider === "melhor_envio") return null
                return (
                  <ActionForm
                    key={target}
                    action={`/api/internal/admin/orders/${order.id}/mark-shipped`}
                    label="Marcar enviado"
                    emphasis
                  />
                )
              }
              if (target === "completed") {
                return (
                  <ActionForm
                    key={target}
                    action={`/api/internal/admin/orders/${order.id}/mark-completed`}
                    label="Marcar concluído"
                    emphasis
                  />
                )
              }
              if (target === "canceled") {
                return (
                  <DangerConfirmForm
                    key={target}
                    action={`/api/internal/admin/orders/${order.id}/cancel`}
                    buttonLabel="Cancelar pedido"
                    title="Confirmar cancelamento"
                    description={CANCELLATION_COPY}
                    confirmLabel="Sim, cancelar pedido"
                  />
                )
              }

              return null
            })}
          </div>

          {transitions.includes("canceled") ? (
            <p className="mt-4 max-w-3xl text-xs leading-5 text-slate-500">{CANCELLATION_COPY}</p>
          ) : null}

          {transitions.length === 0 ? (
            <p className="text-sm text-slate-500">Não há transições operacionais disponíveis para este pedido.</p>
          ) : null}
        </Section>

        {order.shipping_provider === "melhor_envio" ? (
          <ShipmentPanel
            orderId={order.id}
            orderFulfillmentStatus={order.fulfillment_status}
            shipment={shipment}
          />
        ) : null}

        <Section title="Alertas" description="Pendências abertas que precisam de atenção operacional.">
          {attention.length > 0 ? (
            <div className="grid gap-3">
              {attention.map((flag) => (
                <div key={flag.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{flag.code}</p>
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {flag.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Fonte: {flag.source} · aberto em {formatLocalDate(flag.opened_at)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Nenhum alerta operacional aberto.</p>
          )}
        </Section>

        <Section title="Itens" description="Snapshot imutável dos itens comprados neste pedido.">
          <div className="grid gap-3">
            {order.items.map((item, index) => (
              <div
                key={`${item.productId}-${index}`}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">Quantidade: {item.quantity}</p>
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {formatMoney(item.unitPriceCents)} cada
                </p>
              </div>
            ))}
          </div>
        </Section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Cliente">
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailField label="Nome" value={order.customer_name} />
              <DetailField label="E-mail" value={displayValue(order.customer_email)} />
              <DetailField
                label="WhatsApp"
                value={
                  whatsapp ? (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-violet-700 hover:underline"
                    >
                      {order.whatsapp}
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    order.whatsapp
                  )
                }
              />
            </dl>
          </Section>

          <Section title="Entrega">
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailField label="CEP" value={order.cep} />
              <DetailField label="Rua" value={displayValue(order.address_street)} />
              <DetailField label="Número" value={displayValue(order.address_number)} />
              <DetailField label="Complemento" value={displayValue(order.address_complement)} />
              <DetailField label="Bairro" value={displayValue(order.address_neighborhood)} />
              <DetailField
                label="Cidade/UF"
                value={`${displayValue(order.address_city)} / ${displayValue(order.address_state)}`}
              />
            </dl>
          </Section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Frete">
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailField label="Serviço" value={displayValue(order.shipping_service_name)} />
              <DetailField label="Transportadora" value={displayValue(order.shipping_carrier_name)} />
              <DetailField label="Provedor" value={displayValue(order.shipping_provider)} />
              <DetailField label="ID do serviço" value={displayValue(order.shipping_service_id)} />
              <DetailField
                label="Prazo estimado"
                value={
                  order.shipping_delivery_days === null
                    ? "—"
                    : `${order.shipping_delivery_days} dias`
                }
              />
              <DetailField
                label="Valor do frete"
                value={order.shipping_cents === null ? "—" : formatMoney(order.shipping_cents)}
              />
            </dl>
          </Section>

          <Section title="Mercado Pago" description="Informações financeiras somente para consulta.">
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailField label="Provedor" value={order.payment_provider} />
              <DetailField label="Status" value={<PaymentStatusBadge value={order.payment_status} />} />
              <DetailField label="Pagamento" value={displayValue(order.payment_id)} />
              <DetailField label="Preferência" value={displayValue(order.preference_id)} />
              <DetailField label="Detalhe" value={displayValue(order.payment_status_detail)} />
            </dl>
          </Section>
        </div>

        <Section
          title="E-mails transacionais"
          description="Histórico de envio, entrega e falhas. Reenvios são novas tentativas auditáveis e não alteram o registro original."
        >
          <OrderNotificationHistory orderId={order.id} notifications={notifications} />
        </Section>

        <Section title="Linha do tempo" description="Eventos operacionais registrados para este pedido.">
          {events.length > 0 ? (
            <ol className="grid gap-3">
              {events.map((event) => (
                <li key={event.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">{event.event_type}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {event.source} · {formatLocalDate(event.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">Nenhum evento registrado.</p>
          )}
        </Section>

        <Section title="Auditoria" description="Histórico administrativo append-only deste pedido.">
          {audit.length > 0 ? (
            <ol className="grid gap-3">
              {audit.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">{entry.action}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatLocalDate(entry.created_at)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">Nenhuma ação administrativa registrada.</p>
          )}
        </Section>
      </div>
    </AdminShell>
  )
}
