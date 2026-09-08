# Mercado Pago Checkout Pro — configuração operacional

A ProxyBembem usa Mercado Pago Checkout Pro para pagamento, Supabase para catálogo/pedidos/contas e KingHost para o runtime Next.js. O navegador nunca decide preço, frete, total, status de pagamento ou propriedade do pedido.

## Estado atual

- Production: KingHost Node.js 22.1.0.
- Supabase permanece hospedado separadamente.
- `public.products` é a única autoridade de catálogo em runtime.
- O produto precisa estar `published` para ser resolvido por checkout.
- O checkout re-resolve IDs/quantidades contra o catálogo atual e usa o preço/frete atuais do servidor.
- O admin de produtos pode publicar/arquivar/reativar, mas não existe hard delete.
- Guest payment permanece removido: iniciar pagamento exige conta Supabase verificada.

**Não reaplique migrations.** Consulte `docs/superpowers/CURRENT_STATUS.md` e a migration history real antes de qualquer operação de banco.

## Variáveis de Production

Valores reais ficam somente no ambiente privado da KingHost/secret store. Nunca coloque segredos em Git, screenshot, logs ou chat.

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

Use `.env.example` como lista canônica de nomes. `NEXT_PUBLIC_*` contém somente configuração pública; tokens/service keys permanecem server-only.

## Fluxo atual de checkout

1. catálogo, carrinho e cotação são públicos;
2. `POST /api/checkout` exige identidade Supabase verificada antes de reservar pedido;
3. o servidor usa UUID/e-mail confirmado da conta como autoridade de ownership;
4. IDs/quantidades são re-resolvidos em `public.products`, aceitando somente produtos `published`;
5. preço e metadados físicos vêm do produto atual do servidor, nunca do browser;
6. frete é validado/recotado;
7. o pedido é criado no Supabase antes do redirecionamento;
8. a preferência Mercado Pago usa somente valores reconstruídos no servidor;
9. `back_urls` retornam para `/minha-conta/pedidos/{order-id}`.

Se um produto for arquivado antes do pagamento, deixar de existir ou não estiver publicado, o checkout deve falhar fechado em vez de usar dados antigos do carrinho. Se o preço atual mudar, o servidor usa o preço atual.

## Webhook Mercado Pago

Endpoint:

```text
https://www.proxybembem.com.br/api/mercadopago/webhook
```

O webhook valida HMAC, consulta o pagamento diretamente no provedor, valida a referência `PB-...`, compara moeda/valor com a verdade armazenada e aplica a transição via RPC atômico. Divergências vão para revisão; retorno de navegador nunca é autoridade financeira.

## Domínio e retorno privado

```text
NEXT_PUBLIC_SITE_URL=https://www.proxybembem.com.br
```

Retorno canônico:

```text
https://www.proxybembem.com.br/minha-conta/pedidos/<order-uuid>
```

Não reintroduza `/pedido/<token>`.

## Login antes do pagamento

Cliente pode montar carrinho/endereço/frete deslogado. Na tentativa de pagamento sem identidade verificada, o checkout exige login e preserva apenas um rascunho limitado na mesma aba. Ao voltar para `/produtos`, o frete é cotado novamente; quote token antigo nunca é reutilizado.

## Teste seguro sem cobrança real

Para smoke de Production:

1. use uma conta de teste verificada;
2. confira que um produto publicado entra no carrinho com preço atual;
3. altere preço no admin, recarregue/reconcilie e confirme que o carrinho adota o preço atual;
4. arquive um produto e confirme que ele desaparece e não prossegue pelo checkout;
5. reative para draft e confirme que continua não-publicado até publicação explícita;
6. avance checkout apenas até criar pedido/preferência e chegar ao Mercado Pago;
7. **não conclua pagamento real apenas para teste**.

A Phase 3 e a Stage 2 já tiveram aceitação produtiva. O smoke final da Stage 3/admin foi adiado pelo proprietário e deve ser lembrado antes do sign-off final da Phase 4.

## Deploy

Use exclusivamente:

```text
docs/deployment/kinghost.md
```

O fluxo usa `pnpm deploy:kinghost` e restart do app `proxybembem` pelo painel KingHost. Não use procedimento Vercel ou PM2 manual como runbook atual.

## Segurança operacional

- Mercado Pago é a única autoridade de pagamento.
- Não existe ação local “marcar como pago/reembolsado”.
- Catálogo/preço/frete/ownership são reconstruídos no servidor.
- Não exponha Access Token, webhook secret, Supabase secret key ou IDs privados de pedidos.
- Não reaplique migrations já registradas.
- Consulte `CURRENT_STATUS.md` antes de mudanças de integração/banco/rollout.
