import type { Metadata } from "next"
import { getPublicStoreSettings } from "@/lib/server/store-settings-cache"

export const metadata: Metadata = {
  title: "Trocas e reembolsos",
  description: "Saiba como solicitar suporte para problemas, cancelamentos, trocas e reembolsos.",
  alternates: {
    canonical: "/trocas-e-reembolsos",
  },
}

export default async function TrocasReembolsosPage() {
  const storeSettings = await getPublicStoreSettings()
  const contactEmail = storeSettings.contactEmail

  return (
    <section className="relative pt-20 sm:pt-24 pb-14 min-h-screen">
      <div className="container mx-auto px-4 relative z-10">
        <article className="mx-auto max-w-3xl rounded-2xl border border-white/70 bg-white/85 p-5 shadow-xl backdrop-blur-md sm:p-8">
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Trocas e reembolsos</h1>
          <p className="mt-2 text-sm text-slate-500">Última atualização: 28/08/2026</p>

          <div className="mt-8 space-y-7 text-slate-700 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-slate-900">Como pedir atendimento</h2>
              <p className="mt-2">
                {contactEmail ? (
                  <>
                    Entre em contato pelo WhatsApp publicado no site ou pelo e-mail{" "}
                    <a
                      className="font-semibold text-[#8B5CF6] underline-offset-4 hover:underline"
                      href={`mailto:${contactEmail}`}
                    >
                      {contactEmail}
                    </a>
                    . Informe o número do pedido, explique o ocorrido e, quando fizer sentido, envie fotos
                    que ajudem a identificar o problema.
                  </>
                ) : (
                  <>
                    Entre em contato pelos canais publicados no site. Informe o número do pedido, explique
                    o ocorrido e, quando fizer sentido, envie fotos que ajudem a identificar o problema.
                  </>
                )}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Produto danificado ou com defeito</h2>
              <p className="mt-2">
                Se o item chegar danificado ou apresentar defeito de produção, envie os detalhes para o
                atendimento. Vamos analisar o caso e orientar a solução adequada, que pode envolver nova
                produção, troca, ajuste ou reembolso conforme a situação.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Pedido diferente do combinado</h2>
              <p className="mt-2">
                Se o produto recebido divergir de forma relevante da lista, quantidade ou personalização
                que foi confirmada para produção, informe o atendimento para conferência e correção do
                pedido.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Erro na lista ou no endereço</h2>
              <p className="mt-2">
                Se você perceber um erro na lista de cartas, personalização ou endereço, avise o quanto
                antes. Antes da produção ou postagem pode ser possível corrigir a informação; depois que
                essas etapas avançam, a solução depende do estágio real do pedido e dos custos já gerados.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Cancelamento e desistência</h2>
              <p className="mt-2">
                Pedidos de cancelamento ou desistência devem ser enviados ao atendimento com o número do
                pedido. Como alguns produtos são produzidos sob encomenda ou personalizados, cada situação
                precisa considerar o estágio da produção e os direitos previstos na legislação aplicável.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Reembolso</h2>
              <p className="mt-2">
                Quando um reembolso for aprovado, ele será processado pela forma e pelo provedor de
                pagamento aplicáveis ao pedido. O prazo para o valor aparecer ao cliente pode depender do
                Mercado Pago, banco, administradora ou meio de pagamento utilizado.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Atraso ou perda no transporte</h2>
              <p className="mt-2">
                Se houver atraso relevante, extravio ou outra ocorrência com a transportadora, entre em
                contato para que possamos acompanhar o envio e, quando necessário, abrir a tratativa com
                a transportadora ou com o Melhor Envio.
              </p>
            </section>

            <section>
              <p className="rounded-xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/5 p-4 font-medium text-slate-800">
                Esta política descreve o procedimento de atendimento da loja e não limita direitos
                previstos na legislação aplicável.
              </p>
            </section>
          </div>
        </article>
      </div>
    </section>
  )
}
