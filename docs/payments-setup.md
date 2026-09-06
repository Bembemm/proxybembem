# Mercado Pago Checkout Pro — configuração operacional

A ProxyBembem usa Mercado Pago Checkout Pro para pagamento e Supabase para persistir pedidos. O servidor reconstrói catálogo, frete e total; o navegador nunca decide preço, frete, total, status de pagamento ou propriedade do pedido.

## Estado atual

O runtime de Production está na KingHost. O Supabase continua hospedado separadamente e já contém as migrations necessárias do checkout, pagamento, contas de cliente e recuperação de senha.

**Não reaplique migrations no projeto Supabase atual.** Antes de qualquer operação de banco, consulte `docs/superpowers/CURRENT_STATUS.md` e a migration history real.

O fluxo atual não possui guest checkout de pagamento:

1. catálogo, carrinho e cotação de frete são públicos;
2. ao iniciar pagamento, `POST /api/checkout` exige uma conta Supabase verificada;
3. o servidor usa o UUID e o e-mail confirmado da conta como autoridade de propriedade;
4. o pedido é criado no Supabase antes do redirecionamento externo;
5. a preferência do Mercado Pago usa somente valores reconstruídos no servidor;
6. os `back_urls` retornam para `/minha-conta/pedidos/{order-id}`;
7. `/pedido/[token]` não faz parte do fluxo ativo.

## 1. Variáveis de Production

Os valores reais ficam somente no `.env.production` privado da KingHost/secret store. Nunca coloque segredos em Git, screenshot, logs ou mensagens.

Contrato relevante:

```text
NEXT_PUBLIC_SITE_URL=https://www.proxybembem.com.br

MERCADO_PAGO_ENVIRONMENT=production
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_SECRET_KEY=

MELHOR_ENVIO_ENVIRONMENT=production
MELHOR_ENVIO_CLIENT_ID=
MELHOR_ENVIO_CLIENT_SECRET=
MELHOR_ENVIO_REDIRECT_URI=https://www.proxybembem.com.br/api/melhor-envio/oauth/callback
MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY=
MELHOR_ENVIO_USER_AGENT=ProxyBembem (contato@proxybembem.com.br)
SHIPPING_ORIGIN_CEP=86730000
SHIPPING_QUOTE_SECRET=
CRON_SECRET=
RATE_LIMIT_SECRET=
```

Use `.env.example` como lista canônica de nomes. `NEXT_PUBLIC_*` só pode conter configuração realmente pública; Access Tokens, secrets e service keys permanecem server-only.

## 2. Configuração do Mercado Pago

Use uma aplicação/credencial compatível com o ambiente configurado:

```text
MERCADO_PAGO_ENVIRONMENT=sandbox
```

para um ambiente de teste isolado, ou:

```text
MERCADO_PAGO_ENVIRONMENT=production
```

para o domínio produtivo.

O código usa o `init_point` devolvido pela criação da preferência. Ele não depende de `sandbox_init_point` para decidir segurança; a separação de ambiente é explícita pelas credenciais/configuração.

Nunca use o mesmo Access Token/segredo por conveniência entre Sandbox e Production.

## 3. Webhook do Mercado Pago

Endpoint produtivo:

```text
https://www.proxybembem.com.br/api/mercadopago/webhook
```

Habilite notificações de **Pagamentos** para esse endpoint e mantenha `MERCADO_PAGO_WEBHOOK_SECRET` apenas no servidor.

O webhook:

1. valida `x-signature` HMAC antes de confiar na notificação;
2. aceita somente um `data.id` de pagamento válido;
3. consulta o pagamento diretamente no Mercado Pago;
4. valida a referência `PB-...`;
5. converte o valor para centavos inteiros;
6. aplica a transição por RPC atômico no Supabase;
7. compara moeda/valor com o total confiável armazenado;
8. envia divergências para `manual_review` em vez de aprovar;
9. impede que outro `payment_id` sobrescreva um pagamento aprovado/revertido confiável.

O navegador e os parâmetros de retorno do Mercado Pago nunca são autoridade de status.

## 4. Domínio, origem e URLs de retorno

Production usa:

```text
NEXT_PUBLIC_SITE_URL=https://www.proxybembem.com.br
```

Esse valor participa de:

- origem canônica aceita pelo checkout;
- `notification_url` do Mercado Pago;
- retorno para a área privada do pedido.

O retorno atual é do formato:

```text
https://www.proxybembem.com.br/minha-conta/pedidos/<order-uuid>
```

Não documente nem reintroduza `/pedido/<token>` como retorno ativo.

## 5. Autenticação antes do pagamento

O cliente pode montar o carrinho, preencher endereço e selecionar frete deslogado. Quando tenta iniciar o pagamento:

- a API responde `authentication_required` se não houver identidade verificada;
- o navegador salva temporariamente o rascunho de checkout no `sessionStorage` da mesma aba;
- o carrinho fecha durante `/entrar`;
- depois do login, `/produtos` restaura os campos;
- o frete é cotado novamente e somente o mesmo serviço é re-selecionado quando ainda estiver disponível;
- o token antigo de cotação nunca é reutilizado.

O login grava a sessão Supabase em cookies SSR na própria resposta. `/api/checkout` participa do refresh da sessão.

## 6. Checkout server-authoritative

Antes de criar pedido/preferência, o servidor valida:

- identidade Supabase verificada;
- e-mail do formulário compatível com a conta;
- IDs/quantidades do carrinho contra o catálogo atual;
- endereço normalizado;
- quote token assinado;
- CEP/carrinho da cotação;
- recotação atual do Melhor Envio;
- ownership/idempotência do `checkoutAttemptId`.

Se o frete mudar, a API retorna `shipping_changed` e exige nova confirmação. Nenhum preço vindo do navegador pode reduzir o total.

## 7. Teste seguro sem cobrança real

Para validar o fluxo de aplicação em Production sem gerar cobrança real:

1. faça login com uma conta de teste verificada;
2. monte o carrinho e selecione frete;
3. inicie o checkout somente até o site criar o pedido/preferência e redirecionar para o Mercado Pago;
4. confirme que o pedido aparece em `Minha Conta > Pedidos` e está vinculado à conta correta;
5. não conclua uma cobrança real apenas para testar integração;
6. remova depois somente fixtures sintéticas claramente identificadas e ainda não pagas.

A aceitação da Phase 3 já validou esse fluxo em Production, incluindo isolamento entre duas contas e retorno privado.

## 8. Deploy na KingHost

O procedimento canônico não fica duplicado aqui. Use:

```text
docs/deployment/kinghost.md
```

O fluxo normal usa `pnpm deploy:kinghost`, publica os assets no webroot e exige restart pelo painel da KingHost. Não use instruções antigas de Vercel como procedimento operacional atual.

## 9. Segurança operacional

- Mercado Pago é a única autoridade de pagamento.
- Não existe ação local “marcar como pago/reembolsado”.
- Não faça auto-pagamento com a mesma parte atuando como comprador e vendedor apenas para testar Production.
- Não exponha Access Token, webhook secret, Supabase secret key ou IDs privados de pedidos em logs/chat.
- Não reaplique migrations já registradas no Supabase.
- Consulte `CURRENT_STATUS.md` antes de qualquer mudança de integração, banco ou rollout.
