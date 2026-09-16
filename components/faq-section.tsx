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
    <section className="relative bg-gradient-to-b from-transparent to-white/30 pb-12 pt-8 sm:pb-16 sm:pt-10">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 rounded-full px-4 py-1.5 mb-4">
            <HelpCircle className="w-5 h-5 text-[#8B5CF6]" />
            <span className="text-sm sm:text-base text-[#8B5CF6] font-medium">
              Tire suas dúvidas
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
            Perguntas Frequentes
          </h2>
          <p className="text-slate-600 text-base sm:text-lg max-w-md mx-auto">
            Tudo o que você precisa saber antes de comprar
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-white/70 backdrop-blur-sm border border-slate-200/60 rounded-lg px-4 sm:px-6 shadow-sm"
              >
                <AccordionTrigger className="text-left text-base sm:text-lg font-medium text-slate-800 hover:text-[#8B5CF6] transition-colors py-4 [&[data-state=open]]:text-[#8B5CF6]">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-base leading-relaxed pb-4">
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
