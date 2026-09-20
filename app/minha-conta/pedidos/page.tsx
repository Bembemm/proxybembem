import type { Metadata } from "next"
import Link from "next/link"
import { AccountPage } from "@/components/account/account-page"
import { isCheckoutExpired } from "@/lib/checkout-expiration"
import { fulfillmentStatusLabel, paymentStatusLabel } from "@/lib/order-status-labels"
import { requireCustomerPageAccess } from "@/lib/server/customer-auth"
import { listOwnOrders } from "@/lib/server/customer-orders"

export const metadata: Metadata = {
  title: "Meus pedidos",
}

const PAGE_SIZE = 10

function parsePage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page >= 1 && page <= 1000 ? page : 1
}

function formatMoney(cents: number | null) {
  if (cents === null) return "—"
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const params = await searchParams
  const page = parsePage(params.page)
  const next =
    page > 1 ? `/minha-conta/pedidos?page=${page}` : "/minha-conta/pedidos"
  await requireCustomerPageAccess(next)
  const result = await listOwnOrders({ page, pageSize: PAGE_SIZE })
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))

  return (
    <AccountPage
      title="Meus pedidos"
      description="Veja valores, pagamento e andamento da produção. Checkouts não pagos expiram após 72 horas e ficam apenas no histórico."
    >
      {result.orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          Nenhum pedido encontrado.
        </div>
      ) : (
        <div className="grid gap-3">
          {result.orders.map((order) => {
            const checkoutExpired = isCheckoutExpired(order)

            return (
              <Link
                key={order.id}
                href={`/minha-conta/pedidos/${order.id}`}
                className={`group block rounded-xl border p-4 transition sm:p-5 ${
                  checkoutExpired
                    ? "border-slate-200 bg-slate-50 opacity-80 hover:border-slate-300"
                    : "border-slate-200 bg-slate-50/60 hover:border-violet-200 hover:bg-violet-50/50"
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-950 group-hover:text-violet-800">{order.orderNumber}</p>
                      {checkoutExpired ? (
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          Expirado
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="text-sm text-slate-600 sm:text-right">
                    <p className="font-semibold text-slate-950">{formatMoney(order.totalCents ?? order.subtotalCents)}</p>
                    <p className="mt-1">
                      Pagamento: {checkoutExpired ? "Expirado — não pago" : paymentStatusLabel(order.paymentStatus)}
                    </p>
                    <p>
                      Produção: {checkoutExpired ? "Não iniciada" : fulfillmentStatusLabel(order.fulfillmentStatus)}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Paginação dos pedidos" className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5 text-sm">
          {page > 1 ? (
            <Link href={`/minha-conta/pedidos?page=${page - 1}`} className="font-semibold text-violet-700 hover:underline">
              Anterior
            </Link>
          ) : <span />}
          <span className="text-slate-500">Página {page} de {totalPages}</span>
          {page < totalPages ? (
            <Link href={`/minha-conta/pedidos?page=${page + 1}`} className="font-semibold text-violet-700 hover:underline">
              Próxima
            </Link>
          ) : <span />}
        </nav>
      ) : null}
    </AccountPage>
  )
}
