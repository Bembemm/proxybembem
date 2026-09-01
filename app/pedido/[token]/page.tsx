import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { OrderStatus } from "@/components/order-status"
import { toOrderDisplayData } from "@/lib/order-display"
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

  return (
    <section className="relative pt-20 sm:pt-24 pb-12 min-h-screen">
      <div className="container mx-auto px-3 sm:px-4 relative z-10">
        <OrderStatus order={toOrderDisplayData(order)} />
      </div>
    </section>
  )
}
