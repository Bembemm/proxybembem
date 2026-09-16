"use client"

import { HelpCircle } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

interface FaqSectionProps {
  productionLeadTimeBusinessDays: number
}

export function FaqSection({ productionLeadTimeBusinessDays }: FaqSectionProps) {
  const productionLeadTime =
    productionLeadTimeBusinessDays === 1
      ? "1 dia útil"
      : `${productionLeadTimeBusinessDays} dias úteis`

  const faqs = [
    {
      question: "Qual a qualidade do material?",
      answer:
        "Nossas cartas são produzidas com Impressão Direta Premium em papel fotográfico de alta gramatura e recebem um acabamento laminado especial. Esse processo garante cores extremamente vibrantes, textos perfeitamente nítidos e alta durabilidade, além de contar com um corte de precisão para um encaixe perfeito nos seus sleeves.",
    },
    {
      question: "Qual o prazo de produção e envio?",
      answer: `Após a confirmação do pagamento, o prazo de produção é de até ${productionLeadTime}. Depois da postagem, o prazo de entrega varia conforme o serviço de frete e a sua região.`,
    },
    {
      question: "Como recebo o meu código de rastreio?",
      answer:
        "Assim que o seu pedido for despachado, você receberá o código de rastreio diretamente no WhatsApp que utilizou para fazer o pedido. Com ele, você pode acompanhar sua encomenda em tempo real pelo site dos Correios.",
    },
  ]

  return (
    <section className="relative bg-gradient-to-b from-transparent to-white/30 pb-10 pt-6 sm:pb-12 sm:pt-8">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mb-7 text-center sm:mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-4 py-1.5">
            <HelpCircle className="h-5 w-5 text-[#8B5CF6]" />
            <span className="text-sm font-medium text-[#8B5CF6] sm:text-base">
              Tire suas dúvidas
            </span>
          </div>
          <h2 className="mb-2 text-3xl font-bold text-slate-900 sm:text-4xl">
            Perguntas Frequentes
          </h2>
          <p className="mx-auto max-w-md text-base text-slate-600 sm:text-lg">
            Tudo o que você precisa saber antes de comprar
          </p>
        </div>

        <div className="mx-auto max-w-2xl">
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="rounded-lg border border-slate-200/60 bg-white/70 px-4 shadow-sm backdrop-blur-sm sm:px-6"
              >
                <AccordionTrigger className="py-4 text-left text-base font-medium text-slate-800 transition-colors hover:text-[#8B5CF6] sm:text-lg [&[data-state=open]]:text-[#8B5CF6]">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-base leading-relaxed text-slate-600">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
