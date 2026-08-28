# Ativação do pagamento direto

Esta integração usa Mercado Pago Checkout Pro para Pix/cartão e Supabase para registrar pedidos. O site nunca recebe número do cartão ou CVV e nunca confia em preço/status enviados pelo navegador.

## 1. Criar o banco no Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute todo o arquivo `supabase/migrations/202608280001_create_orders.sql`.
4. Em **Settings / API Keys**, copie a chave server-side atual `sb_secret_...` (preferida) e a URL do projeto.
5. Não use a chave publishable/anon para gravar pedidos e nunca coloque a chave secret em variável `NEXT_PUBLIC_*`.

Variáveis:

```text
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

A tabela `orders` fica com RLS habilitado e sem privilégios para `anon`/`authenticated`; apenas o backend usa a chave de serviço.

## 2. Criar a aplicação no Mercado Pago

1. Entre em Mercado Pago Developers / Suas integrações.
2. Crie uma aplicação para Checkout Pro.
3. Comece pelas credenciais de teste.
4. Copie o Access Token para:

```text
MERCADO_PAGO_ACCESS_TOKEN=TEST-...
```

O código detecta um token iniciado por `TEST-` e usa `sandbox_init_point` quando o Mercado Pago o disponibilizar.

## 3. Configurar o webhook

No painel da aplicação do Mercado Pago:

1. Abra **Webhooks / Configurar notificações**.
2. Selecione o evento **Pagamentos**.
3. Use a URL HTTPS:

```text
https://SEU-DOMINIO/api/mercadopago/webhook
```

4. Salve e revele a chave secreta do webhook.
5. Configure:

```text
MERCADO_PAGO_WEBHOOK_SECRET=SUA_CHAVE_DO_WEBHOOK
```

O endpoint valida `x-signature` com HMAC-SHA256 antes de consultar o pagamento. Depois, consulta `GET /v1/payments/{id}` no Mercado Pago e só marca um pedido como aprovado quando `external_reference`, moeda e valor batem com o pedido salvo.

> O Mercado Pago informa que pagamentos feitos com credenciais de teste não enviam os webhooks normais de pagamento. Para validar o recebimento do webhook em teste, use o simulador disponível em **Webhooks** no painel. Para um teste de ponta a ponta desta implementação, use como Data ID um pagamento de teste que possa ser consultado pela mesma credencial.

## 4. Configurar o domínio público

Na Vercel, adicione:

```text
NEXT_PUBLIC_SITE_URL=https://SEU-DOMINIO
```

Em produção, a URL precisa ser HTTPS. Ela é usada para:

- retorno do Mercado Pago para `/pedido/<token>`;
- `notification_url` do webhook;
- validação de origem do checkout.

Se testar em um deploy Preview, use a URL HTTPS desse Preview ou uma URL pública equivalente. `localhost` não funciona como `notification_url` do Mercado Pago.

## 5. Variáveis necessárias na Vercel

Configure todas como Environment Variables do projeto:

```text
NEXT_PUBLIC_SITE_URL=
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

Somente `NEXT_PUBLIC_SITE_URL` é pública. As outras quatro devem permanecer server-side.

## 6. Fluxo de teste recomendado

1. Execute a migration do Supabase.
2. Configure as credenciais de teste do Mercado Pago e do Supabase na Vercel Preview.
3. Abra o site Preview e adicione o produto ao carrinho.
4. Informe nome, WhatsApp e CEP.
5. Clique em **Finalizar com Mercado Pago**.
6. Confirme que o valor mostrado pelo Mercado Pago é o valor real do catálogo, mesmo se o localStorage tiver sido alterado manualmente.
7. Conclua um pagamento de teste.
8. Volte para `/pedido/<token>` e confirme que o pedido existe e fica aguardando confirmação enquanto o webhook não for processado.
9. Use o simulador de webhook com um Data ID consultável para validar a assinatura + atualização do pedido.
10. Confirme que um webhook com valor/moeda divergente resulta em `manual_review`, nunca em `approved`.

## 7. Antes de produção

- Confirme com o Mercado Pago que o tipo de produto comercializado pela ProxyBembem é aceito pelas políticas da conta e da plataforma de pagamentos.
- Troque o Access Token de teste pelo de produção.
- Configure o webhook também no modo produtivo.
- Use o domínio final HTTPS em `NEXT_PUBLIC_SITE_URL`.
- Faça uma compra real de baixo valor controlada por você e confira pedido, pagamento, retorno e atendimento antes de divulgar o checkout.

## Limitação intencional desta primeira versão

O pagamento do Mercado Pago cobre **somente os produtos**. O frete é informado de forma explícita no carrinho e na página do pedido como calculado separadamente pelo CEP no atendimento. Automatizar cotação/pagamento de frete deve ser uma integração posterior, para não misturar uma regra ainda não definida com o fluxo financeiro já seguro.
