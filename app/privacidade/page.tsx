import type { Metadata } from "next"
import { getPublicStoreSettings } from "@/lib/server/store-settings-cache"

export const metadata: Metadata = {
  title: "Privacidade",
  description: "Saiba como a ProxyBembem usa os dados necessários para pedidos, pagamentos e entregas.",
  alternates: {
    canonical: "/privacidade",
  },
}

export default async function PrivacidadePage() {
  const storeSettings = await getPublicStoreSettings()
  const contactEmail = storeSettings.contactEmail

  return (
    <section className="relative pt-20 sm:pt-24 pb-14">
      <div className="container mx-auto px-4 relative z-10">
        <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-lg sm:p-8">
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Privacidade</h1>
          <p className="mt-2 text-sm text-slate-500">Última atualização: 28/08/2026</p>

          <div className="mt-8 space-y-7 text-slate-700 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-slate-900">Dados usados no pedido</h2>
              <p className="mt-2">
                Para criar e atender um pedido, podemos receber nome, WhatsApp, endereço de entrega,
                CEP, produtos e quantidades do carrinho, além de identificadores do pedido e do status
                do pagamento. Esses dados são usados somente quando necessários para o funcionamento da
                compra, produção, suporte e entrega.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Para que usamos esses dados</h2>
              <p className="mt-2">
                Usamos as informações para calcular e apresentar o frete antes do pagamento, criar e
                acompanhar o pedido, entrar em contato sobre produção ou entrega, confirmar o status do
                pagamento e prestar suporte quando necessário.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Pagamento pelo Mercado Pago</h2>
              <p className="mt-2">
                O pagamento é processado pelo Mercado Pago. A ProxyBembem não recebe nem armazena o
                número completo do cartão, CVV ou credenciais bancárias do cliente. O sistema recebe do
                provedor somente as informações necessárias para identificar e conferir o pagamento do
                pedido.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Frete e Melhor Envio</h2>
              <p className="mt-2">
                O Melhor Envio é usado para consultar opções, preço e prazo de transporte. Os dados de
                destino e do pacote necessários à cotação e ao fluxo de envio podem ser compartilhados
                com esse serviço. A compra e emissão da etiqueta de postagem são realizadas posteriormente
                pela ProxyBembem no ambiente do Melhor Envio.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Informações técnicas</h2>
              <p className="mt-2">
                O site pode registrar informações técnicas e de uso necessárias para segurança, diagnóstico
                e desempenho. Nome, WhatsApp e endereço do pedido não são intencionalmente enviados como
                eventos técnicos pela ProxyBembem.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Proteção e acesso</h2>
              <p className="mt-2">
                Os registros de pedidos são acessados pelo backend da aplicação e não ficam disponíveis
                para consulta anônima direta no banco de dados. Empregamos controles técnicos para reduzir
                acesso indevido, sem afirmar que qualquer sistema conectado à internet possa oferecer
                segurança absoluta.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Contato</h2>
              <p className="mt-2">
                {contactEmail ? (
                  <>
                    Para dúvidas sobre seu pedido ou sobre o uso dos seus dados, escreva para{" "}
                    <a
                      className="font-semibold text-[#8B5CF6] underline-offset-4 hover:underline"
                      href={`mailto:${contactEmail}`}
                    >
                      {contactEmail}
                    </a>
                    .
                  </>
                ) : (
                  <>Para dúvidas sobre seu pedido ou sobre o uso dos seus dados, utilize os canais de contato publicados no site.</>
                )}
              </p>
            </section>
          </div>
        </article>
      </div>
    </section>
  )
}
