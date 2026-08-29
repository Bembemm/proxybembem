"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/contexts/cart-context"
import { buildWhatsAppOrderUrl, formatPrice } from "@/lib/checkout"
import type { OrderDisplayData } from "@/lib/order-display"

interface OrderStatusProps {
  order: OrderDisplayData
}

function statusContent(status: string) {
  if (status === "approved") {
    return {
      title: "Pagamento aprovado",
      description:
        "Recebemos a confirmação do Mercado Pago. Agora envie sua lista para iniciarmos o atendimento do pedido.",
      icon: <CheckCircle2 className="w-14 h-14 text-green-500" />,
    }
  }

  if (["rejected", "cancelled", "checkout_error"].includes(status)) {
    return {
      title: "Pagamento não confirmado",
      description:
        "O pagamento não foi concluído. Seu carrinho continua salvo e você pode tentar novamente.",
      icon: <XCircle className="w-14 h-14 text-red-500" />,
    }
  }

  if (["refunded", "charged_back"].includes(status)) {
    return {
      title: "Pagamento devolvido ou revertido",
      description:
        "Este pagamento não está mais aprovado. Fale conosco se precisar conferir o pedido.",
      icon: <RotateCcw className="w-14 h-14 text-amber-500" />,
    }
  }

  if (status === "manual_review") {
    return {
      title: "Pagamento em análise",
      description:
        "Recebemos uma confirmação que precisa de conferência antes da produção. Não envie novamente o pagamento.",
      icon: <AlertTriangle className="w-14 h-14 text-amber-500" />,
    }
  }

  return {
    title: "Aguardando confirmação",
    description:
      "O Mercado Pago ainda não confirmou o pagamento. Se você acabou de pagar, atualize esta página em alguns instantes.",
    icon: <Clock3 className="w-14 h-14 text-[#8B5CF6]" />,
  }
}

function formatCep(cep: string) {
  const digits = cep.replace(/\D/g, "")
  return /^\d{8}$/.test(digits)
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : cep
}

export function OrderStatus({ order }: OrderStatusProps) {
  const { clearCart } = useCart()
  const clearedRef = useRef(false)
  const content = statusContent(order.paymentStatus)

  useEffect(() => {
    if (order.paymentStatus === "approved" && !clearedRef.current) {
      clearedRef.current = true
      clearCart()
    }
  }, [clearCart, order.paymentStatus])

  const supportMessage =
    order.paymentStatus === "approved"
      ? `Olá! Meu pedido ${order.orderNumber} foi pago pelo site. Vou enviar minha lista de cartas/deck agora.`
      : `Olá! Preciso de ajuda com o pedido ${order.orderNumber} feito pelo site.`
  const supportUrl = buildWhatsAppOrderUrl(supportMessage)
  const pending = ![
    "approved",
    "rejected",
    "cancelled",
    "refunded",
    "charged_back",
    "manual_review",
    "checkout_error",
  ].includes(order.paymentStatus)
  const hasShippingService = Boolean(order.carrierName || order.serviceName)

  return (
    <div className="bg-white/80 backdrop-blur-md border border-white/70 shadow-xl rounded-xl p-5 sm:p-8 max-w-2xl mx-auto">
      <div className="text-center">
        <div className="flex justify-center mb-4">{content.icon}</div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{content.title}</h1>
        <p className="text-slate-600 text-base sm:text-lg mt-3 leading-relaxed">
          {content.description}
        </p>
        <p className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          Pedido {order.orderNumber}
        </p>
      </div>

      <div className="mt-7 border-y border-slate-200 py-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Produtos</p>
        {order.items.map((item, index) => (
          <div key={`${item.title}-${index}`} className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-slate-900">{item.title}</p>
              <p className="text-sm text-slate-500">Quantidade: {item.quantity}</p>
            </div>
            <p className="font-semibold text-slate-700 shrink-0">
              {formatPrice((item.unitPriceCents * item.quantity) / 100)}
            </p>
          </div>
        ))}

        <div className="space-y-2 pt-3 border-t border-slate-200">
          <div className="flex justify-between gap-4 text-sm sm:text-base">
            <span className="font-medium text-slate-600">Subtotal dos produtos</span>
            <span className="font-semibold text-slate-800">
              {formatPrice(order.subtotalCents / 100)}
            </span>
          </div>

          {order.shippingCents !== null && (
            <div className="flex justify-between gap-4 text-sm sm:text-base">
              <span className="font-medium text-slate-600">Frete</span>
              <span className="font-semibold text-slate-800">
                {formatPrice(order.shippingCents / 100)}
              </span>
            </div>
          )}

          <div className="flex justify-between gap-4 pt-2 border-t border-slate-200">
            <span className="font-bold text-slate-900">
              {order.paymentStatus === "approved" ? "Total pago" : "Total do pedido"}
            </span>
            <span className="font-bold text-[#8B5CF6]">
              {formatPrice(order.totalCents / 100)}
            </span>
          </div>
        </div>
      </div>

      {(hasShippingService || order.deliveryDays !== null || order.address) && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-4">
          {(hasShippingService || order.deliveryDays !== null) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Entrega
              </p>
              {hasShippingService && (
                <p className="font-semibold text-slate-900">
                  {[order.carrierName, order.serviceName].filter(Boolean).join(" — ")}
                </p>
              )}
              {order.deliveryDays !== null && (
                <p className="text-sm text-slate-600 mt-1">
                  Prazo estimado: {order.deliveryDays}{" "}
                  {order.deliveryDays === 1 ? "dia útil" : "dias úteis"}
                </p>
              )}
            </div>
          )}

          {order.address && (
            <div className={hasShippingService || order.deliveryDays !== null ? "pt-4 border-t border-slate-200" : ""}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Endereço de entrega
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {order.address.street}, {order.address.number}
                {order.address.complement ? ` — ${order.address.complement}` : ""}
                <br />
                {order.address.neighborhood} — {order.address.city}/{order.address.state}
                <br />
                CEP {formatCep(order.address.cep)}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 space-y-3">
        <Button asChild className="w-full h-12 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white">
          <a href={supportUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="w-5 h-5 mr-2" />
            {order.paymentStatus === "approved"
              ? "Enviar minha lista no WhatsApp"
              : "Falar sobre este pedido"}
          </a>
        </Button>

        {pending && (
          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar status
          </Button>
        )}

        <Button asChild variant="ghost" className="w-full h-11 text-slate-600">
          <Link href="/produtos">Voltar aos produtos</Link>
        </Button>
      </div>
    </div>
  )
}
