# KingHost Sandbox — Mercado Pago + Melhor Envio

Este runbook cria um ambiente de teste isolado para validar o checkout do Mercado Pago e a integração do Melhor Envio na KingHost sem alterar o aplicativo de Production.

Branch usada pelo sandbox:

```text
sandbox/kinghost-mercadopago-melhor-envio
```

## Regra principal de isolamento

Use uma **aplicação KingHost separada**, com diretório, domínio/subdomínio e webroot próprios. Não aponte este branch para a aplicação Production e não publique os assets no webroot do site ao vivo.

O sandbox também precisa de dados isolados: **não use o Supabase de Production** para criar pedidos, usuários, OAuth state, remessas ou eventos de teste. Use um projeto Supabase separado para sandbox com o mesmo schema/migrations necessários ao aplicativo.

Da mesma forma, **não copie credenciais ou segredos de Production** para o sandbox. Mercado Pago, Melhor Envio, Supabase e segredos internos devem ter valores próprios do ambiente de teste.

## Pré-requisitos

- aplicação KingHost Node.js separada para sandbox;
- Node.js `22.1.0`;
- pnpm 10;
- host HTTPS exclusivo, representado abaixo por `https://<sandbox-host>`;
- diretório de projeto exclusivo, por exemplo `~/apps_nodejs/proxybembem-sandbox`;
- webroot exclusivo da aplicação sandbox, representado por `<sandbox-web-root>`;
- projeto Supabase separado para sandbox;
- credenciais de teste/sandbox próprias do Mercado Pago;
- aplicativo Sandbox próprio no Melhor Envio.

Não invente nem reutilize o domínio de Production como host do sandbox. Substitua `<sandbox-host>` somente depois de o host HTTPS da aplicação de teste existir.

## `.env.production` da aplicação sandbox

A KingHost executa o build otimizado com `NODE_ENV=production`, mas este deploy continua sendo sandbox. Por isso o arquivo privado `.env.production` da aplicação sandbox deve declarar explicitamente:

```text
APP_ENVIRONMENT=sandbox
NEXT_PUBLIC_SITE_URL=https://<sandbox-host>

NEXT_PUBLIC_SUPABASE_URL=<sandbox-supabase-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sandbox-publishable-key>
ADMIN_USER_ID=<sandbox-admin-user-uuid>

MERCADO_PAGO_ENVIRONMENT=sandbox
MERCADO_PAGO_ACCESS_TOKEN=<sandbox-access-token>
MERCADO_PAGO_WEBHOOK_SECRET=<sandbox-webhook-secret>

SUPABASE_URL=<sandbox-supabase-url>
SUPABASE_SECRET_KEY=<sandbox-secret-key>

MELHOR_ENVIO_ENVIRONMENT=sandbox
MELHOR_ENVIO_CLIENT_ID=<sandbox-client-id>
MELHOR_ENVIO_CLIENT_SECRET=<sandbox-client-secret>
MELHOR_ENVIO_REDIRECT_URI=https://<sandbox-host>/api/melhor-envio/oauth/callback
MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY=<sandbox-64-hex-key>
MELHOR_ENVIO_USER_AGENT=ProxyBembem (contato@proxybembem.com.br)
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false
SHIPPING_ORIGIN_CEP=86730000
SHIPPING_QUOTE_SECRET=<sandbox-secret>
CRON_SECRET=<sandbox-secret>
RATE_LIMIT_SECRET=<sandbox-secret>
RATE_LIMIT_TRUSTED_PROXY_HOPS=0
```

`APP_ENVIRONMENT=sandbox` é a trava que permite usar os dois provedores em sandbox mesmo com o Next rodando em runtime otimizado de Production. Se `APP_ENVIRONMENT` estiver ausente, o runtime continua exigindo ambientes de provedor `production` e falha fechado.

Mantenha `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` durante toda a validação inicial. Cotação, OAuth, preparação e demais fluxos que não gastam saldo continuam testáveis sem liberar compra de etiqueta.

Mantenha também `RATE_LIMIT_TRUSTED_PROXY_HOPS=0` no primeiro deploy do sandbox. Com zero hops confiáveis, a aplicação ignora `X-Forwarded-For` e `X-Real-IP` e usa o bucket `unknown`; isso evita confiar em um header forjado, mas compartilha o limite entre clientes. Só altere para um valor entre `1` e `5` depois de verificar, neste host sandbox, a cadeia real `X-Forwarded-For` que a KingHost entrega ao processo Node.

Segredos reais não entram em commit, issue, documentação, screenshot ou chat. Gere segredos independentes, quando necessário, com:

```bash
openssl rand -hex 32
```

## Mercado Pago sandbox

Use somente credenciais de teste/sandbox do Mercado Pago nessa aplicação.

Configure o webhook do ambiente de teste para:

```text
https://<sandbox-host>/api/mercadopago/webhook
```

O `MERCADO_PAGO_WEBHOOK_SECRET` precisa corresponder exatamente ao segredo do webhook configurado para esse endpoint de sandbox. O aplicativo deriva suas URLs públicas de retorno a partir de `NEXT_PUBLIC_SITE_URL`, portanto esse valor nunca deve apontar para `https://www.proxybembem.com.br` no sandbox.

Faça pagamentos apenas com usuários/cartões de teste aceitos pelo Mercado Pago. Não use comprador, cartão ou dinheiro real como etapa de aceitação do sandbox.

## Melhor Envio sandbox

Crie/use um aplicativo **Sandbox** separado no Melhor Envio. O callback configurado no provedor precisa ser exatamente:

```text
https://<sandbox-host>/api/melhor-envio/oauth/callback
```

Depois do deploy, entre no admin do sandbox e conecte a integração por:

```text
/admin/integrations/melhor-envio
```

O OAuth state, tokens criptografados, remetente e remessas devem ficar somente no Supabase sandbox. Não reutilize Client ID, Client Secret, token ou `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` de Production.

## Deploy na aplicação KingHost separada

No diretório exclusivo do sandbox:

```bash
cd ~/apps_nodejs/proxybembem-sandbox
git fetch origin
git checkout sandbox/kinghost-mercadopago-melhor-envio
git pull --ff-only origin sandbox/kinghost-mercadopago-melhor-envio
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production KINGHOST_WEB_ROOT=<sandbox-web-root> npx pnpm@10 deploy:kinghost
```

`KINGHOST_WEB_ROOT` é **obrigatório no sandbox**. O publicador de assets da aplicação possui `~/www` como fallback; executar `deploy:kinghost` sem um webroot exclusivo poderia publicar assets no webroot errado. Confirme o webroot da aplicação sandbox no painel KingHost antes de executar o comando.

No painel KingHost, a aplicação sandbox deve usar seu próprio diretório e o `app.js` preparado pelo projeto. Reinicie **somente a aplicação sandbox** depois do deploy. Não reinicie nem altere a aplicação Production para testar este branch.

## Verificação antes do primeiro checkout

Confirme, nesta ordem:

1. o host sandbox abre por HTTPS;
2. `NEXT_PUBLIC_SITE_URL` mostra o host sandbox, nunca o host Production;
3. a aplicação usa o projeto Supabase sandbox;
4. `APP_ENVIRONMENT=sandbox`;
5. `MERCADO_PAGO_ENVIRONMENT=sandbox`;
6. `MELHOR_ENVIO_ENVIRONMENT=sandbox`;
7. `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false`;
8. `RATE_LIMIT_TRUSTED_PROXY_HOPS=0` até a cadeia de proxy ser verificada;
9. o callback do Melhor Envio aponta para o host sandbox;
10. o webhook do Mercado Pago aponta para o host sandbox;
11. nenhum segredo de Production foi copiado para o ambiente de teste.

## Aceitação Mercado Pago

No host sandbox:

- autentique um cliente de teste;
- adicione produto(s) ao carrinho;
- informe CEP e selecione um frete retornado pelo Melhor Envio sandbox;
- inicie checkout;
- confirme que o redirecionamento vai para Checkout Pro de teste;
- conclua com credenciais de comprador/pagamento de teste;
- confirme que o webhook chega em `/api/mercadopago/webhook`;
- confirme que somente o pedido no Supabase sandbox muda de estado.

Nenhum pedido, usuário ou evento deve aparecer no Supabase Production.

## Aceitação Melhor Envio

Com `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false`:

- autorize o aplicativo Sandbox pelo admin;
- confirme que a integração aparece conectada no ambiente sandbox;
- configure um remetente de teste no admin sandbox;
- faça cotações em `/api/shipping/quote` por meio do checkout normal;
- confirme que as opções vêm do Melhor Envio sandbox;
- valide preparação de remessa somente quando houver um pedido sandbox elegível;
- confirme que qualquer tentativa de compra de etiqueta continua bloqueada pela flag.

Não habilite compra de etiqueta apenas para “ver se funciona”. Essa etapa deve permanecer separada e explícita.

## Cron e notificações

Não copie `CRON_SECRET`, `RATE_LIMIT_SECRET`, `RESEND_API_KEY` ou `RESEND_WEBHOOK_SECRET` de Production. Se cron ou e-mail não fizerem parte do teste atual, deixe os jobs externos do sandbox desativados. Se forem testados depois, use credenciais e endpoints exclusivos do sandbox.

## Rollback

O rollback do sandbox não exige qualquer mudança em Production:

- pare/reinicie somente a aplicação KingHost sandbox;
- volte o branch sandbox para um commit previamente validado, se necessário;
- mantenha o projeto Supabase sandbox separado;
- não altere `main`, o diretório Production ou `~/www` durante o rollback do sandbox.

A aplicação Production continua seguindo `docs/deployment/kinghost.md`; este documento é exclusivo para o ambiente de teste Mercado Pago + Melhor Envio.
