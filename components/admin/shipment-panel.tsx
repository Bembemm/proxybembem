import type { FulfillmentStatus } from "../../lib/server/fulfillment.ts"
import {
  deriveAdminShipmentPanelState,
  type AdminShipmentHistoryKind,
  type AdminShipmentProjection,
} from "../../lib/server/shipments.ts"
import { ShipmentConfirmAction } from "./shipment-confirm-action.tsx"

const STATE_LABELS: Record<AdminShipmentProjection["state"], string> = {
  draft: "Rascunho",
  prepared: "Preparada",
  in_cart: "Pronta para compra",
  purchase_pending: "Compra em verificação",
  purchased: "Comprada",
  generation_pending: "Geração em andamento",
  generated: "Etiqueta gerada",
  cancel_pending: "Cancelamento em verificação",
  posted: "Postada",
  in_transit: "Em trânsito",
  delivered: "Entregue",
  canceled: "Cancelada",
  attention_required: "Atenção necessária",
}

const HISTORY_LABELS: Record<AdminShipmentHistoryKind, string> = {
  draft_created: "Remessa criada",
  prepare_claimed: "Preparação iniciada",
  prepare_reverted: "Preparação revertida",
  added_to_cart: "Adicionada ao carrinho",
  purchase_claimed: "Compra iniciada",
  purchased: "Etiqueta comprada",
  purchase_reverted: "Compra revertida",
  attention_required: "Atenção necessária",
  reconciled: "Estado reconciliado",
  generation_claimed: "Geração iniciada",
  generated: "Etiqueta gerada",
  cancel_claimed: "Cancelamento iniciado",
  cancel_reverted: "Cancelamento revertido",
  canceled: "Etiqueta cancelada",
  posted: "Postagem confirmada",
  tracking_updated: "Rastreamento atualizado",
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function PostForm({ action, label }: { action: string; label: string }) {
  return (
    <form method="post" action={action}>
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 sm:w-auto"
      >
        {label}
      </button>
    </form>
  )
}

function DifferenceLine({
  difference,
}: {
  difference: ReturnType<typeof deriveAdminShipmentPanelState>["difference"]
}) {
  if (!difference) return <p className="text-sm text-slate-500">Diferença: indisponível</p>
  if (difference.kind === "store_pays") {
    return <p className="text-sm font-medium text-amber-700">Diferença: loja paga +{formatMoney(difference.cents)}</p>
  }
  if (difference.kind === "margin") {
    return <p className="text-sm font-medium text-emerald-700">Diferença: margem +{formatMoney(difference.cents)}</p>
  }
  return <p className="text-sm font-medium text-slate-600">Diferença: R$ 0,00</p>
}

export function ShipmentPanel({
  orderId,
  orderFulfillmentStatus,
  shipment,
}: {
  orderId: string
  orderFulfillmentStatus: FulfillmentStatus
  shipment: AdminShipmentProjection | null
}) {
  const state = deriveAdminShipmentPanelState({ orderFulfillmentStatus, shipment })
  const has = (action: (typeof state.actions)[number]) => state.actions.includes(action)

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Melhor Envio</p>
        <h2 className="mt-1 text-base font-semibold text-slate-950">Revisar envio / DC-e</h2>
        <p className="mt-1 text-sm text-slate-500">
          Compra, geração, postagem e cancelamento são ações separadas e sempre explícitas.
        </p>
      </div>

      {!shipment ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Ainda não existe remessa preparada para este pedido.</p>
          {has("prepare") ? (
            <PostForm
              action={`/api/internal/admin/orders/${orderId}/shipment/prepare`}
              label="Preparar remessa"
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{STATE_LABELS[shipment.state]}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serviço</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{shipment.carrierName} — {shipment.serviceName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Remetente</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{shipment.sender.name}</p>
              <p className="text-xs text-slate-500">{shipment.sender.personType === "pf" ? "CPF" : "CNPJ"}: {shipment.sender.maskedTaxId}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ambiente</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{shipment.environment === "production" ? "Production" : "Sandbox"}</p>
            </div>
          </div>

          {shipment.state === "in_cart" && shipment.providerCostCents !== null ? (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <p className="text-sm text-slate-700">Cliente pagou <strong>{formatMoney(shipment.customerShippingCents)}</strong></p>
                <p className="text-sm text-slate-700">Etiqueta agora <strong>{formatMoney(shipment.providerCostCents)}</strong></p>
              </div>
              <div className="mt-2"><DifferenceLine difference={state.difference} /></div>
              {has("purchase") ? (
                <div className="mt-4">
                  <ShipmentConfirmAction
                    kind="purchase"
                    action={`/api/internal/admin/shipments/${shipment.id}/purchase`}
                    buttonLabel={`Comprar etiqueta por ${formatMoney(shipment.providerCostCents)}`}
                    environment={shipment.environment}
                    customerPaidCents={shipment.customerShippingCents}
                    labelCostCents={shipment.providerCostCents}
                    difference={state.difference}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {has("reconcile_purchase") ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900">Compra em verificação</p>
              <p className="mt-1 text-sm text-amber-800">Não compre novamente enquanto o resultado anterior não for reconciliado.</p>
              <div className="mt-3">
                <PostForm
                  action={`/api/internal/admin/shipments/${shipment.id}/reconcile`}
                  label="Reconciliar compra"
                />
              </div>
            </div>
          ) : null}

          {has("reconcile_cancel") ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900">Cancelamento em verificação</p>
              <p className="mt-1 text-sm text-amber-800">Atualize o estado antes de tentar qualquer nova ação.</p>
              <div className="mt-3">
                <PostForm
                  action={`/api/internal/admin/shipments/${shipment.id}/reconcile`}
                  label="Atualizar estado"
                />
              </div>
            </div>
          ) : null}

          {has("generate") ? (
            <PostForm action={`/api/internal/admin/shipments/${shipment.id}/generate`} label="Gerar etiqueta" />
          ) : null}

          {has("refresh_generation") ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900">Geração em andamento</p>
              <p className="mt-1 text-sm text-amber-800">A atualização consulta o estado atual sem comprar nem gerar novamente.</p>
              <div className="mt-3">
                <PostForm action={`/api/internal/admin/shipments/${shipment.id}/generate`} label="Atualizar estado" />
              </div>
            </div>
          ) : null}

          {has("print_label") || has("print_dace") || has("post") || has("cancel") ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {has("print_label") ? (
                <a
                  href={`/api/internal/admin/shipments/${shipment.id}/print-label`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
                >
                  Imprimir etiqueta
                </a>
              ) : null}
              {has("print_dace") ? (
                <a
                  href={`/api/internal/admin/shipments/${shipment.id}/print-dace`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
                >
                  Imprimir DACE
                </a>
              ) : null}
              {has("post") ? (
                <PostForm action={`/api/internal/admin/shipments/${shipment.id}/post`} label="Confirmar postagem" />
              ) : null}
              {has("cancel") ? (
                <ShipmentConfirmAction
                  kind="cancel"
                  action={`/api/internal/admin/shipments/${shipment.id}/cancel`}
                  buttonLabel="Cancelar etiqueta"
                  currentState={STATE_LABELS[shipment.state]}
                />
              ) : null}
            </div>
          ) : null}

          {shipment.state === "canceled" && has("prepare") ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-600">A etiqueta anterior foi cancelada. Como o pedido continua elegível, uma nova remessa pode ser preparada.</p>
              <div className="mt-3">
                <PostForm
                  action={`/api/internal/admin/orders/${orderId}/shipment/prepare`}
                  label="Preparar remessa"
                />
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-950">Rastreamento</h3>
            {shipment.trackingCode ? (
              <p className="mt-2 text-sm text-slate-700">Código: <span className="font-mono font-semibold">{shipment.trackingCode}</span></p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Código ainda não disponível.</p>
            )}
            {shipment.lastTrackingSyncAt ? (
              <p className="mt-1 text-xs text-slate-500">Última sincronização: {formatDate(shipment.lastTrackingSyncAt)}</p>
            ) : null}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-950">Histórico da remessa</h3>
            {shipment.history.length > 0 ? (
              <ol className="mt-3 grid gap-2">
                {shipment.history.map((entry) => (
                  <li key={`${entry.kind}-${entry.createdAt}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-sm font-medium text-slate-800">{HISTORY_LABELS[entry.kind]}</p>
                    <p className="text-xs text-slate-500">{entry.source} · {formatDate(entry.createdAt)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Nenhum evento de remessa registrado.</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
