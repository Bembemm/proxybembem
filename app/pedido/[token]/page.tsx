import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { OrderClaimForm } from "@/components/account/order-claim-form"
import { OrderStatus } from "@/components/order-status"
import { toOrderDisplayData } from "@/lib/order-display"
import { getOptionalCustomerIdentity } from "@/lib/server/customer-auth"
import { getOrderByPublicToken } from "@/lib/server/orders"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Status do pedido",
  description: "Confira a confirmação do seu pedido na ProxyBembem.",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const order = await getOrderByPublicToken(token)

  if (!order) notFound()

  const identity = await getOptionalCustomerIdentity()
  const canClaim = order.customer_email !== null && order.customer_id === null
  const loginHref = `/entrar?next=${encodeURIComponent(`/pedido/${token}`)}`

  return (
    <section className="relative pt-20 sm:pt-24 pb-12 min-h-screen">
      <div className="container mx-auto px-3 sm:px-4 relative z-10">
        <OrderStatus order={toOrderDisplayData(order)} />

        {canClaim ? (
          <div className="mx-auto mt-4 max-w-3xl rounded-xl border bg-background p-4 sm:p-5">
            {identity ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Este pedido ainda não está vinculado a uma conta.
                </p>
                <OrderClaimForm publicToken={token} />
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Entre na sua conta para tentar adicionar este pedido.
                </p>
                <Link
                  href={loginHref}
                  className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-semibold transition hover:bg-muted"
                >
                  Entrar para adicionar à minha conta
                </Link>
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
