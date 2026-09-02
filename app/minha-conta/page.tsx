import type { Metadata } from "next"
import Link from "next/link"
import { getOwnCustomerProfile } from "@/lib/server/customer-profiles"
import { listOwnOrders } from "@/lib/server/customer-orders"

export const metadata: Metadata = {
  title: "Minha conta",
}

function formatMoney(cents: number | null) {
  if (cents === null) return "—"
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export default async function AccountOverviewPage() {
  const [profile, recent] = await Promise.all([
    getOwnCustomerProfile(),
    listOwnOrders({ page: 1, pageSize: 5 }),
  ])

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Visão geral</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          {profile ? `Olá, ${profile.name}` : "Minha conta"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Acompanhe seus pedidos e mantenha seus dados de contato atualizados.
        </p>
        {!profile ? (
          <Link href="/minha-conta/perfil" className="mt-4 inline-flex rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">
            Completar perfil
          </Link>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-900">Pedidos recentes</h2>
          <Link href="/minha-conta/pedidos" className="text-sm font-semibold text-violet-700 hover:underline">
            Ver todos
          </Link>
        </div>
        {recent.orders.length === 0 ? (
          <p className="text-sm text-slate-600">Nenhum pedido vinculado à sua conta ainda.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.orders.map((order) => (
              <Link
                key={order.id}
                href={`/minha-conta/pedidos/${order.id}`}
                className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-slate-900">{order.orderNumber}</p>
                  <p className="text-sm text-slate-500">{new Date(order.createdAt).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="text-sm text-slate-600 sm:text-right">
                  <p>{formatMoney(order.totalCents ?? order.subtotalCents)}</p>
                  <p>{order.fulfillmentStatus}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
