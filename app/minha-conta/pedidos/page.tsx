import type { Metadata } from "next"
import Link from "next/link"
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
  await requireCustomerPageAccess()
  const params = await searchParams
  const page = parsePage(params.page)
  const result = await listOwnOrders({ page, pageSize: PAGE_SIZE })
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Meus pedidos</h1>
        <p className="text-sm text-slate-600">Veja os pedidos vinculados à sua conta.</p>
      </div>

      {result.orders.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Nenhum pedido encontrado.</p>
      ) : (
        <div className="space-y-3">
          {result.orders.map((order) => (
            <Link
              key={order.id}
              href={`/minha-conta/pedidos/${order.id}`}
              className="block rounded-xl border border-slate-200 p-4 transition hover:border-violet-200 hover:bg-violet-50/40"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-bold text-slate-900">{order.orderNumber}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="text-sm text-slate-600 sm:text-right">
                  <p className="font-semibold text-slate-900">{formatMoney(order.totalCents ?? order.subtotalCents)}</p>
                  <p>Pagamento: {paymentStatusLabel(order.paymentStatus)}</p>
                  <p>Produção: {fulfillmentStatusLabel(order.fulfillmentStatus)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Paginação dos pedidos" className="mt-6 flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link href={`/minha-conta/pedidos?page=${page - 1}`} className="font-semibold text-violet-700 hover:underline">Anterior</Link>
          ) : <span />}
          <span className="text-slate-500">Página {page} de {totalPages}</span>
          {page < totalPages ? (
            <Link href={`/minha-conta/pedidos?page=${page + 1}`} className="font-semibold text-violet-700 hover:underline">Próxima</Link>
          ) : <span />}
        </nav>
      ) : null}
    </section>
  )
}
