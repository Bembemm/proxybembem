# Configuração de frete com Melhor Envio

A integração atual usa o Melhor Envio **somente para cotação de frete no checkout**. Compra, geração e impressão de etiqueta continuam manuais no painel do Melhor Envio depois da aprovação do pagamento.

Runtime: KingHost Node.js 22.1.0. Supabase permanece hospedado separadamente e mantém OAuth/token state criptografado, catálogo e RPCs.

## Arquitetura atual

O backend consulta:

```text
POST /api/v2/me/shipment/calculate
```

Bases:

```text
Sandbox:    https://sandbox.melhorenvio.com.br
Production: https://melhorenvio.com.br
```

A chamada é server-side com Bearer token do token manager OAuth. O navegador nunca recebe access token, refresh token, Client Secret ou chave de criptografia.

Scope atual:

```text
shipping-calculate
```

Não amplie escopo para compra/geração/impressão de etiquetas antes da Phase 5 e de uma aprovação específica de gasto/permissão.

## OAuth / callback

```text
/api/melhor-envio/oauth/callback
https://www.proxybembem.com.br/api/melhor-envio/oauth/callback
```

Uma conta Melhor Envio da ProxyBembem por ambiente. O aplicativo Production deve ser separado do aplicativo Sandbox e usar credenciais próprias.

Não reutilize Client ID, Client Secret, tokens ou chave de criptografia entre Sandbox e Production.

## Variáveis

```text
MELHOR_ENVIO_ENVIRONMENT=production
MELHOR_ENVIO_CLIENT_ID=
MELHOR_ENVIO_CLIENT_SECRET=
MELHOR_ENVIO_REDIRECT_URI=https://www.proxybembem.com.br/api/melhor-envio/oauth/callback
MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY=
MELHOR_ENVIO_USER_AGENT=ProxyBembem (contato@proxybembem.com.br)
SHIPPING_ORIGIN_CEP=86730000
SHIPPING_QUOTE_SECRET=
CRON_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
ADMIN_USER_ID=
```

Use segredos Production próprios e independentes; não copie `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY`, `SHIPPING_QUOTE_SECRET`, `CRON_SECRET` ou `RATE_LIMIT_SECRET` do Sandbox.

Para gerar localmente um segredo independente de 32 bytes:

```bash
openssl rand -hex 32
```

Segredos reais ficam somente no ambiente privado. **Nunca envie valores reais em chat, screenshot, commit, issue, documentação ou log.**

## Admin e autorização OAuth

Fluxo:

```text
/admin/login -> senha -> Authenticator (TOTP) -> /admin -> Integrações -> Melhor Envio
```

A página administrativa protegida da integração é `/admin/integrations/melhor-envio`.

A página de integração está dentro do novo shell administrativo compartilhado (sidebar desktop / drawer mobile), mas a segurança permanece a mesma: owner UUID, AAL2/TOTP e sessão administrativa ativa. O redesign não cria bypass.

A sessão administrativa server-side expira após 30 minutos de inatividade. Se o proprietário perder o Authenticator, a recuperação administrativa é manual pelo Supabase; não existe bypass por SMS, trusted-device ou somente senha.

Conectar/reconectar continua validando origem, rate limit, proprietário, AAL2 e sessão; `state` é aleatório, hasheado, temporário e one-shot. Tokens são criptografados antes de persistir e a UI recebe apenas status sanitizado.

## Renovação automática

Tokens usam AES-256-GCM, versionamento e lease atômica. O token manager refresca preventivamente e, após falha de autenticação reconhecida, faz no máximo um retry com versão nova. Refresh definitivamente rejeitado marca `reauthorization_required`.

Fluxo conceitual de renovação:

```text
claim lease -> decrypt refresh_token -> refresh no provedor ->
criptografar novos tokens -> commit compare-and-set
```

## Refresh de manutenção KingHost

```text
GET /api/internal/melhor-envio/refresh
```

Aceita `CRON_SECRET` via `X-CRON-AUTH` (Cron KingHost) ou `Authorization: Bearer` para diagnóstico controlado. Cadência operacional atual: diária às **03:17**. A resposta é sanitizada e nunca contém tokens.

## Produto e catálogo usados na cotação

`public.products` é a única autoridade runtime. Para cada produto publicado o backend resolve pelo ID:

- preço/valor segurado;
- peso kg;
- comprimento/largura/altura cm;
- quantidade.

O navegador envia IDs/quantidades, mas **não** é autoridade desses valores. Produtos draft/archived não podem ser usados para um checkout novo.

Os dois produtos originais usam provisoriamente 0,50 kg e 25 x 19 x 4 cm. Produtos criados/editados pelo admin armazenam suas próprias dimensões/peso no Supabase. Atualize esses valores quando houver medidas físicas confiáveis e repita smoke de cotação.

## Cotação / proteção contra alteração

Endpoint público:

```text
POST /api/shipping/quote
```

Fluxo:

1. browser envia IDs/quantidades + CEP;
2. servidor reconstrói catálogo/metadados físicos atuais;
3. token manager obtém credencial utilizável;
4. Melhor Envio é consultado;
5. opções válidas recebem token HMAC temporário;
6. checkout recota o mesmo carrinho/CEP;
7. mudança de serviço/preço retorna `shipping_changed` e exige nova confirmação;
8. só depois pedido/preferência é criada.

Production aceita somente Correios IDs **1 (PAC)** e **2 (SEDEX)**; outras modalidades são descartadas de forma controlada.

## Login do cliente

Frete pode ser cotado sem login. Se o cliente precisar entrar antes do pagamento, o rascunho é preservado somente na mesma aba e o frete é **cotado novamente** após login; quote token antigo nunca é reutilizado.

## Depois do pagamento

Etiqueta não é automática nesta fase. Após pagamento aprovado:

1. confira endereço/serviço/valor no pedido;
2. entre manualmente no Melhor Envio;
3. compre o envio/etiqueta;
4. gere/imprima;
5. poste o pacote.

O runtime atual não compra etiqueta, não gera impressão e não rastreia automaticamente.

## Checklist Production

- `MELHOR_ENVIO_ENVIRONMENT=production`;
- aplicativo Production separado;
- callback produtivo exato;
- scope somente `shipping-calculate`;
- admin exige senha + Authenticator/TOTP/AAL2;
- sessão admin expira após 30 minutos de inatividade;
- tokens criptografados;
- PAC/SEDEX IDs 1/2 apenas;
- mudança de carrinho/CEP invalida seleção antiga;
- mudança de preço exige reconfirmação;
- OAuth state não pode ser reutilizado;
- Cron usa segredo e resposta sanitizada;
- produto/preço/peso/dimensões vêm do catálogo Supabase atual;
- Mercado Pago recebe produtos + frete reconstruídos no servidor;
- nenhum segredo aparece em logs/respostas.

O smoke final da Stage 3/admin foi adiado pelo proprietário em 2026-09-08. Antes do sign-off final da Phase 4, lembrar de testar também a página `Integrações > Melhor Envio` dentro da sidebar desktop e drawer mobile, além de uma cotação válida; não é necessário gastar saldo/comprar etiqueta.

## Deploy / manutenção

Use somente `docs/deployment/kinghost.md`. Supabase não deve ser migrado para KingHost e migrations registradas não devem ser reaplicadas. Consulte `docs/superpowers/CURRENT_STATUS.md` antes de mudanças de OAuth, banco, runtime ou rollout.
