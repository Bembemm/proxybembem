# Ativação do pagamento direto

A integração usa Mercado Pago Checkout Pro para pagamento e Supabase para registrar pedidos. O valor enviado ao Mercado Pago é reconstruído no servidor e inclui **produtos + frete selecionado**. O navegador nunca decide preço, frete, total ou status de pagamento.

## 1. Preparar o Supabase

No SQL Editor do projeto, execute as migrations nesta ordem:

```text
supabase/migrations/202608280001_create_orders.sql
supabase/migrations/202608280002_shipping_checkout_hardening.sql
supabase/migrations/202608280003_atomic_payment_events.sql
```

A migration `003` cria unicidade para `payment_id`. Antes de aplicá-la em um banco que já recebeu testes, confira se há IDs de pagamento duplicados:

```sql
select payment_id, count(*)
from public.orders
where payment_id is not null
group by payment_id
having count(*) > 1;
```

Se a consulta retornar linhas, revise e limpe **somente os registros de teste que você reconhece** antes de aplicar a migration. Não apague pedidos reais para contornar a restrição.

Em **Settings / API Keys**, use a chave server-side atual do projeto e mantenha-a apenas no backend:

```text
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

A tabela `orders` usa RLS e não concede acesso direto a `anon`/`authenticated`. A migration `002` também cria o armazenamento/RPC de rate limit, e a `003` cria o RPC atômico de transição dos pagamentos.

## 2. Configurar o Mercado Pago

Crie ou use uma aplicação de Checkout Pro apropriada ao ambiente de teste e configure:

```text
MERCADO_PAGO_ENVIRONMENT=sandbox
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
```

`MERCADO_PAGO_ENVIRONMENT` é explícito e aceita apenas `sandbox` ou `production`; o código não tenta descobrir o ambiente pelo prefixo do token.

Para iniciar o Checkout Pro, a aplicação usa o `init_point` retornado pela preferência. O modo efetivo de teste/produção depende das credenciais e da conta usadas na integração. O código **não exige `sandbox_init_point`**.

Nunca coloque Access Token ou segredo de webhook em variável `NEXT_PUBLIC_*`, no repositório, em screenshot ou em mensagens.

## 3. Configurar o webhook do Mercado Pago

No painel da aplicação, habilite notificações de **Pagamentos** para:

```text
https://SEU-DOMINIO/api/mercadopago/webhook
```

O webhook implementado:

1. valida `x-signature` HMAC antes de ler o corpo opcional ou consultar provedores;
2. aceita apenas um `data.id` de pagamento numérico válido;
3. consulta o pagamento diretamente no Mercado Pago;
4. valida a referência `PB-...` do pedido;
5. converte o valor recebido para centavos inteiros;
6. aplica o evento em um RPC atômico no Supabase;
7. compara moeda e valor com `total_cents` do pedido, usando `subtotal_cents` apenas como fallback para pedidos legados sem frete armazenado;
8. envia divergências de valor/moeda para `manual_review` em vez de aprovar.

Eventos duplicados ou fora de ordem são tratados dentro da transação do banco. Um pagamento aprovado não pode ser sobrescrito por outro `payment_id` conflitante.

## 4. Configurar o domínio público

Use em Vercel:

```text
NEXT_PUBLIC_SITE_URL=https://www.proxybembem.com.br
```

Em Production essa variável é obrigatória e precisa usar HTTPS. Ela define:

- retorno para `/pedido/<token>`;
- `notification_url` do Mercado Pago;
- origem canônica aceita pelo checkout.

Production só aceita a origem canônica configurada. Preview continua aceitando a origem HTTPS do deployment ativo para permitir testes.

Para testar webhooks em Preview, o endpoint precisa estar publicamente acessível ao Mercado Pago. Se a Vercel Deployment Protection estiver bloqueando chamadas externas, ajuste a proteção apenas pelo tempo necessário ao teste e reative-a depois, quando aplicável.

## 5. Variáveis relacionadas ao checkout

Além das variáveis de pagamento e Supabase, o checkout atual depende da configuração de frete e rate limit:

```text
NEXT_PUBLIC_SITE_URL=
MERCADO_PAGO_ENVIRONMENT=sandbox
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
SUPABASE_URL=
SUPABASE_SECRET_KEY=
MELHOR_ENVIO_ENVIRONMENT=sandbox
MELHOR_ENVIO_ACCESS_TOKEN=
MELHOR_ENVIO_USER_AGENT=ProxyBembem (contato@proxybembem.com.br)
SHIPPING_ORIGIN_CEP=86730000
SHIPPING_QUOTE_SECRET=
RATE_LIMIT_SECRET=
```

`SHIPPING_QUOTE_SECRET` e `RATE_LIMIT_SECRET` devem ser segredos aleatórios fortes e permanecer apenas no servidor. Consulte `docs/shipping-setup.md` para a configuração do Melhor Envio.

## 6. Fluxo de teste em Preview

Depois de aplicar as migrations e configurar as variáveis de Preview:

1. abra o deployment Preview;
2. adicione um ou mais produtos/quantidades ao carrinho;
3. informe nome, WhatsApp, CEP e endereço completo;
4. aguarde as opções de frete retornadas pelo Melhor Envio Sandbox;
5. selecione uma opção e confirme que o resumo mostra produtos, frete e total;
6. clique em **Finalizar com Mercado Pago**;
7. confirme no Checkout Pro que o valor é exatamente o total mostrado no site;
8. conclua o pagamento com usuários/credenciais de teste compatíveis entre comprador e vendedor;
9. confirme que o retorno vai para `/pedido/<token>`;
10. confirme que a página mostra o status vindo do Supabase, não do parâmetro de retorno do Mercado Pago;
11. valide que o webhook atualiza o pedido para o status correto;
12. confira subtotal, frete, total, transportadora, serviço, prazo e endereço na página do pedido.

Se o preço do frete mudar entre a cotação e o clique de pagamento, o backend recota e retorna `shipping_changed`; o comprador precisa confirmar a nova opção antes de ser redirecionado.

## 7. Antes de Production

Antes de trocar o ambiente:

- mantenha `main` sem alterações até a revisão final da branch;
- confirme que CI, typecheck e build estão verdes no mesmo SHA que será promovido;
- use credenciais de Production novas e separadas das de Sandbox/Preview;
- defina `MERCADO_PAGO_ENVIRONMENT=production` junto com o Access Token produtivo;
- configure o segredo e a URL produtiva do webhook;
- use `NEXT_PUBLIC_SITE_URL=https://www.proxybembem.com.br`;
- configure também o Melhor Envio Production conforme `docs/shipping-setup.md`;
- confirme com os provedores que o uso da conta e a categoria de produto atendem às políticas aplicáveis;
- não faça auto-pagamento com a mesma parte atuando como comprador e vendedor para “testar” Production.

A primeira transação produtiva deve ser acompanhada com atenção a pedido, pagamento, webhook e entrega antes de aumentar o volume.
