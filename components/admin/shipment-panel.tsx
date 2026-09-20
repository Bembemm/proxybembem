import type { FulfillmentStatus } from "../../lib/server/fulfillment.ts"
import type {
  AdminShipmentHistoryKind,
  AdminShipmentProjection,
} from "../../lib/server/shipments.ts"

const STATE_LABELS: Record<AdminShipmentProjection["state"], string> = {
  draft: "Rascunho",
  prepared: "Preparação iniciada",
  in_cart: "Adicionada ao carrinho",
  purchase_pending: "Compra antiga em verificação",
  purchased: "Comprada no histórico",
  generation_pending: "Geração antiga em andamento",
  generated: "Etiqueta gerada no histórico",
  cancel_pending: "Cancelamento antigo em verificação",
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
  purchase_claimed: "Compra iniciada (fluxo antigo)",
  purchased: "Etiqueta comprada (fluxo antigo)",
  purchase_reverted: "Compra revertida (fluxo antigo)",
  attention_required: "Atenção necessária",
  reconciled: "Estado reconciliado",
  generation_claimed: "Geração iniciada (fluxo antigo)",
  generated: "Etiqueta gerada (fluxo antigo)",
  cancel_claimed: "Cancelamento iniciado (fluxo antigo)",
  cancel_reverted: "Cancelamento revertido (fluxo antigo)",
  canceled: "Etiqueta cancelada (fluxo antigo)",
  posted: "Postagem confirmada (fluxo antigo)",
  tracking_updated: "Rastreamento atualizado (fluxo antigo)",
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
        className="inline-flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:w-auto"
      >
        {label}
      </button>
    </form>
  )
}

function melhorEnvioUrl(environment: AdminShipmentProjection["environment"]) {
  return environment === "production"
    ? "https://melhorenvio.com.br"
    : "https://sandbox.melhorenvio.com.br"
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
  const canPrepare =
    orderFulfillmentStatus === "ready_to_ship" &&
    (
      shipment === null ||
      shipment.state === "canceled" ||
      shipment.state === "draft" ||
      shipment.state === "prepared"
    )

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
          Melhor Envio
        </p>
        <h2 className="mt-1 text-base font-semibold text-slate-950">
          Preparar remessa
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          O ProxyBembem somente prepara a remessa e a adiciona ao carrinho do Melhor Envio.
          Compra, geração, impressão e demais operações são feitas diretamente no Melhor Envio.
        </p>
      </div>

      {!shipment ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Ainda não existe remessa preparada para este pedido.
          </p>
          {canPrepare ? (
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Estado
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {STATE_LABELS[shipment.state]}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Serviço
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {shipment.carrierName} — {shipment.serviceName}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Remetente
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {shipment.sender.name}
              </p>
              <p className="text-xs text-slate-500">
                {shipment.sender.personType === "pf" ? "CPF" : "CNPJ"}: {shipment.sender.maskedTaxId}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ambiente
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {shipment.environment === "production" ? "Produção" : "Sandbox"}
              </p>
            </div>
          </div>

          {shipment.providerCostCents !== null ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Valor informado ao preparar
              </p>
              <p className="mt-1 text-base font-semibold text-slate-950">
                {formatMoney(shipment.providerCostCents)}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                O valor final e o pagamento são confirmados diretamente no Melhor Envio.
              </p>
            </div>
          ) : null}

          {shipment.state === "in_cart" ? (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
              <p className="font-semibold text-violet-950">
                Remessa adicionada ao carrinho do Melhor Envio
              </p>
              <p className="mt-1 text-sm leading-6 text-violet-900">
                Abra o Melhor Envio para comprar, gerar e imprimir a etiqueta. O ProxyBembem
                não realiza essas operações.
              </p>
              <a
                href={melhorEnvioUrl(shipment.environment)}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 sm:w-auto"
              >
                Abrir Melhor Envio
              </a>
            </div>
          ) : shipment.state !== "draft" && shipment.state !== "prepared" ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">
                Esta remessa possui estado registrado por um fluxo anterior
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                A partir de agora, continue qualquer compra, geração, impressão ou ajuste
                diretamente no Melhor Envio.
              </p>
              <a
                href={melhorEnvioUrl(shipment.environment)}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-violet-300 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 sm:w-auto"
              >
                Abrir Melhor Envio
              </a>
            </div>
          ) : null}

          {canPrepare ? (
            <PostForm
              action={`/api/internal/admin/orders/${orderId}/shipment/prepare`}
              label={shipment.state === "canceled" ? "Preparar nova remessa" : "Tentar preparar novamente"}
            />
          ) : null}

          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              Histórico da remessa
            </h3>
            {shipment.history.length > 0 ? (
              <ol className="mt-3 grid gap-2">
                {shipment.history.map((entry) => (
                  <li
                    key={`${entry.kind}-${entry.createdAt}`}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <p className="text-sm font-medium text-slate-800">
                      {HISTORY_LABELS[entry.kind]}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.source} · {formatDate(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Nenhum evento de remessa registrado.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
