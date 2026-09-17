import type { Metadata } from "next"
import Link from "next/link"
import { AccountPage } from "@/components/account/account-page"
import { fulfillmentStatusLabel } from "@/lib/order-status-labels"
import { requireCustomerPageAccess } from "@/lib/server/customer-auth"
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
  await requireCustomerPageAccess()
  const [profile, recent] = await Promise.all([
    getOwnCustomerProfile(),
    listOwnOrders({ page: 1, pageSize: 5 }),
  ])

  return (
    <AccountPage
      title={profile ? `Olá, ${profile.name}` : "Minha conta"}
      description="Acompanhe seus pedidos e mantenha seus dados de contato atualizados."
    >
      <div className="space-y-6">
        {!profile ? (
          <div className="flex flex-col gap-4 rounded-xl border border-violet-100 bg-violet-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="font-semibold text-slate-950">Complete seu perfil</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Salve seu nome e WhatsApp para facilitar o suporte aos seus pedidos.
              </p>
            </div>
            <Link
              href="/minha-conta/perfil"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            >
              Completar perfil
            </Link>
          </div>
        ) : null}

        <section aria-labelledby="recent-orders-title" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="recent-orders-title" className="text-lg font-bold text-slate-950 sm:text-xl">
                Pedidos recentes
              </h2>
              <p className="mt-1 text-sm text-slate-500">Os últimos pedidos vinculados à sua conta.</p>
            </div>
            <Link href="/minha-conta/pedidos" className="shrink-0 text-sm font-semibold text-violet-700 hover:underline">
              Ver todos
            </Link>
          </div>

          {recent.orders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              Nenhum pedido vinculado à sua conta ainda.
            </div>
          ) : (
            <div className="grid gap-3">
              {recent.orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/minha-conta/pedidos/${order.id}`}
                  className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-violet-200 hover:bg-violet-50/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-950 group-hover:text-violet-800">{order.orderNumber}</p>
                    <p className="mt-1 text-sm text-slate-500">{new Date(order.createdAt).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <div className="text-sm text-slate-600 sm:text-right">
                    <p className="font-semibold text-slate-950">{formatMoney(order.totalCents ?? order.subtotalCents)}</p>
                    <p className="mt-1">{fulfillmentStatusLabel(order.fulfillmentStatus)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AccountPage>
  )
}
