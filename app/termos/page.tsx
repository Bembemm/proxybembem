import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Termos",
  description: "Condições de compra, pagamento, personalização e entrega da ProxyBembem.",
}

export default function TermosPage() {
  return (
    <section className="relative pt-20 sm:pt-24 pb-14 min-h-screen">
      <div className="container mx-auto px-4 relative z-10">
        <article className="mx-auto max-w-3xl rounded-2xl border border-white/70 bg-white/85 p-5 shadow-xl backdrop-blur-md sm:p-8">
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Termos da loja</h1>
          <p className="mt-2 text-sm text-slate-500">Última atualização: 28/08/2026</p>

          <div className="mt-8 space-y-7 text-slate-700 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-slate-900">Sobre os produtos proxy</h2>
              <p className="mt-2">
                A ProxyBembem comercializa cartas proxy não oficiais destinadas a jogo casual, testes,
                montagem de decks e uso de coleção ou personalização. Elas não são cartas originais da
                Wizards of the Coast e não são apresentadas como permitidas em torneios sancionados.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Personalização e lista do cliente</h2>
              <p className="mt-2">
                A descrição do produto, as artes apresentadas e as informações de deck ou lista enviadas
                pelo cliente definem os requisitos de produção. Quando houver solicitação especial com
                custo adicional, esse valor deve ser informado e aceito antes de uma cobrança adicional.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Preço e pagamento</h2>
              <p className="mt-2">
                O checkout apresenta o preço atual dos produtos somado ao frete selecionado antes do
                pagamento. O pagamento é processado pelo Mercado Pago. Um pedido só é tratado como pago
                depois que o backend recebe e valida o status correspondente informado pelo provedor.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Frete e prazo de entrega</h2>
              <p className="mt-2">
                As opções de transportadora, serviço, preço e prazo são consultadas pelo Melhor Envio de
                acordo com origem, destino, disponibilidade e dados do pacote. O prazo exibido é uma
                estimativa da modalidade escolhida e não representa garantia de data exata de entrega.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Endereço de entrega</h2>
              <p className="mt-2">
                O cliente deve revisar rua, número, complemento, bairro, cidade, UF e CEP antes de pagar.
                Se perceber um erro, deve entrar em contato o quanto antes para verificarmos se ainda é
                possível corrigir os dados antes da produção ou postagem.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Atendimento</h2>
              <p className="mt-2">
                A comunicação sobre lista de cartas, produção, pagamento, envio ou suporte pode ocorrer
                pelo WhatsApp e pelo e-mail informados no site e no pedido.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900">Direitos do consumidor</h2>
              <p className="mt-2">
                Estes termos descrevem o funcionamento da loja e não eliminam direitos previstos na
                legislação aplicável. O procedimento de atendimento para problemas, cancelamentos,
                trocas e reembolsos está detalhado na página específica da ProxyBembem.
              </p>
            </section>
          </div>
        </article>
      </div>
    </section>
  )
}
