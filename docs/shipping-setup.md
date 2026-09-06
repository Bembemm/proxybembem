# Configuração de frete com Melhor Envio

A integração usa o Melhor Envio **somente para cotação de frete no checkout**. A compra, geração e impressão de etiqueta continuam manuais no painel do Melhor Envio depois que o pagamento do cliente for aprovado.

O runtime atual da aplicação é KingHost Node.js 22.1.0. Supabase continua hospedado separadamente e armazena o estado OAuth criptografado/RPCs necessários.

## 1. Arquitetura atual

O backend consulta:

```text
POST /api/v2/me/shipment/calculate
```

Bases do provedor:

```text
Sandbox:    https://sandbox.melhorenvio.com.br
Production: https://melhorenvio.com.br
```

A requisição é server-side com Bearer token obtido pelo token manager OAuth, `Accept: application/json`, `Content-Type: application/json` e o `User-Agent` da ProxyBembem. O navegador nunca recebe access token, refresh token, Client Secret ou chave de criptografia.

O único scope solicitado pelo fluxo atual é:

```text
shipping-calculate
```

Não amplie permissões para compra, geração ou impressão de etiquetas enquanto essas etapas permanecerem manuais. A ampliação de escopo pertence à futura Phase 5 e exige revisão/aceitação próprias.

## 2. OAuth e callback

A aplicação usa OAuth2 single-account: uma conta Melhor Envio da própria ProxyBembem por ambiente, sem conexão de contas de clientes/terceiros.

Callback implementado:

```text
/api/melhor-envio/oauth/callback
```

Callback produtivo canônico:

```text
https://www.proxybembem.com.br/api/melhor-envio/oauth/callback
```

`MELHOR_ENVIO_REDIRECT_URI` deve coincidir exatamente com a URL cadastrada no aplicativo do provedor. Sandbox e Production usam aplicativos/credenciais separados; não reutilize Client ID, Client Secret, tokens ou chave de criptografia entre ambientes por conveniência.

## 3. Variáveis e segredos

Contrato atual do Melhor Envio:

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
```

Para um ambiente Sandbox isolado, use `MELHOR_ENVIO_ENVIRONMENT=sandbox` e credenciais/callback próprios desse ambiente.

A área administrativa também depende de Supabase Auth:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
ADMIN_USER_ID=
```

`NEXT_PUBLIC_SUPABASE_URL` e a publishable key são configuração pública de Auth; não concedem privilégio administrativo por si só. `ADMIN_USER_ID` e as credenciais privilegiadas do backend são server-only.

Gere valores independentes para criptografia, assinatura de cotação, Cron e rate limit. Exemplo local para um segredo de 32 bytes:

```bash
openssl rand -hex 32
```

`MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` exige exatamente 64 caracteres hexadecimais (256 bits). Não reutilize esse valor como `SHIPPING_QUOTE_SECRET`, `CRON_SECRET` ou `RATE_LIMIT_SECRET`.

**Nunca envie valores reais em chat, screenshot, commit, issue, documentação ou log.** Configure-os diretamente no ambiente privado da KingHost/secret store apropriado.

## 4. Login administrativo e autorização OAuth

O fluxo é protegido pelo admin existente:

```text
/admin/login -> email + senha -> Authenticator -> /admin ->
Integração Melhor Envio -> Conectar Melhor Envio
```

Existe uma única conta administrativa autorizada por UUID. Senha sem TOTP/AAL2 não libera páginas nem ações administrativas protegidas. A sessão administrativa server-side expira após 30 minutos de inatividade e não possui bypass/trusted-device.

Ao conectar/reconectar o Melhor Envio:

1. entre no admin por HTTPS;
2. conclua senha + TOTP;
3. abra `/admin/integrations/melhor-envio`;
4. inicie **Conectar Melhor Envio**;
5. o servidor valida origem, rate limit, proprietário, AAL2 e sessão administrativa ativa;
6. gera `state` aleatório e persiste somente o SHA-256 com validade curta;
7. redireciona ao Melhor Envio solicitando apenas `shipping-calculate`;
8. o callback consome o `state` uma única vez;
9. troca o código por tokens;
10. access/refresh token são criptografados antes de persistir;
11. a UI recebe somente status sanitizado de sucesso/falha.

O callback é público porque o provedor precisa chamá-lo; sua segurança depende do `state` aleatório, hasheado, temporário e one-shot.

## 5. Armazenamento e renovação automática

Os tokens persistidos no Supabase usam envelopes AES-256-GCM. O AAD vincula cada valor ao ambiente (`sandbox`/`production`) e ao tipo (`access`/`refresh`).

O token manager usa versionamento e lease atômica para impedir corridas de refresh. Conceitualmente:

```text
claim lease -> decrypt refresh_token -> refresh no provedor ->
criptografar novos tokens -> commit compare-and-set
```

A renovação preventiva começa quando o access token se aproxima da expiração. Se uma cotação receber uma falha de autenticação reconhecida do provedor, o site força obtenção de uma versão mais nova e repete a cotação no máximo uma vez. Um token que acabou de ser rejeitado não pode ser reutilizado nesse retry.

Se o refresh for rejeitado como credencial inválida/revogada, a autorização entra em `reauthorization_required`; o frete falha de forma genérica até o proprietário autorizar novamente pelo admin.

## 6. Refresh de manutenção na KingHost

A rota interna é:

```text
GET /api/internal/melhor-envio/refresh
```

Ela aceita o mesmo `CRON_SECRET` de duas formas:

```text
X-CRON-AUTH: <CRON_SECRET>
```

para o Cronjob da KingHost, ou:

```text
Authorization: Bearer <CRON_SECRET>
```

para diagnóstico manual controlado.

O Cronjob da KingHost deve seguir a configuração canônica de `docs/deployment/kinghost.md`. A cadência operacional atual é diária às **03:17**.

A rota usa o mesmo token manager do checkout e retorna somente status sanitizado (`{"ok":true}` em sucesso). Falha de autenticação retorna `401`; falha de refresh retorna `503`. Nenhum token aparece na resposta.

## 7. Dados de produto usados na cotação

Para cada item confiável do catálogo, o backend envia:

- peso em quilogramas;
- largura, altura e comprimento em centímetros;
- valor segurado em reais;
- quantidade.

Os produtos atuais usam provisoriamente o seguinte perfil físico de pacote:

```text
Deck Commander Proxy 100 Cartas
Peso:        0,50 kg
Comprimento: 25 cm
Largura:     19 cm
Altura:      4 cm

Deck Proxy 60 Cartas
Peso:        0,50 kg
Comprimento: 25 cm
Largura:     19 cm
Altura:      4 cm
```

Esses valores são estimativas do produto embalado. Quando houver medidas reais confiáveis, atualize o catálogo e repita os testes de cotação.

O backend reconstrói preço, peso e dimensões pelo ID do produto. Valores enviados pelo navegador não são autoridade.

## 8. Preço, serviço e proteção contra alteração

O endpoint público é:

```text
POST /api/shipping/quote
```

Fluxo de segurança:

1. navegador envia somente IDs/quantidades e CEP;
2. servidor reconstrói carrinho e metadados físicos;
3. token manager obtém um access token utilizável;
4. servidor consulta Melhor Envio;
5. opções válidas recebem token HMAC temporário;
6. no checkout, o servidor recota o mesmo carrinho/CEP;
7. mudança de serviço/preço retorna `shipping_changed` e exige nova confirmação;
8. somente depois o pedido/preferência do Mercado Pago é criado.

O preço exibido no navegador nunca é fonte de verdade.

Em Production, o código atual aceita somente os serviços Correios IDs **1 (PAC)** e **2 (SEDEX)**. Outros serviços são descartados; se PAC/SEDEX não estiverem disponíveis, a cotação falha de forma controlada em vez de usar uma modalidade inesperada.

## 9. Relação com o login do cliente

O cliente pode cotar frete sem login. A conta verificada só é obrigatória ao iniciar pagamento.

Se o usuário precisa entrar:

- o checkout salva temporariamente apenas o rascunho necessário na mesma aba;
- a tela de login não reabre o carrinho por cima;
- ao voltar para `/produtos`, o endereço é restaurado;
- o frete é **cotado novamente**;
- somente o ID do serviço escolhido é lembrado para tentar selecionar a nova cotação equivalente;
- o quote token antigo nunca é reutilizado.

## 10. Depois que o cliente pagar

A geração de etiqueta **não é automática** nesta fase. Depois que o pedido estiver aprovado:

1. confira endereço, serviço escolhido e valor do frete no pedido;
2. entre no Melhor Envio;
3. compre manualmente o envio/etiqueta;
4. gere e imprima a etiqueta;
5. poste o pacote na modalidade correspondente.

O site atual não chama APIs de compra, geração, impressão ou rastreio e não precisa de webhook do Melhor Envio para esse fluxo.

## 11. Checklist operacional de Production

- `MELHOR_ENVIO_ENVIRONMENT=production`;
- aplicativo Production separado;
- callback exatamente `https://www.proxybembem.com.br/api/melhor-envio/oauth/callback`;
- somente scope `shipping-calculate`;
- admin exige senha + TOTP/AAL2;
- credenciais/tokens persistidos somente de forma criptografada;
- cotação real funciona para CEP válido;
- apenas PAC/SEDEX IDs 1/2 são aceitos em Production;
- mudança de CEP/carrinho invalida seleção anterior;
- mudança de preço exige reconfirmação;
- `state` OAuth consumido não pode ser reutilizado;
- Cron da KingHost chama a rota de refresh com segredo e recebe resposta sanitizada;
- Mercado Pago recebe produtos + frete do servidor no mesmo total;
- nenhum segredo aparece em logs ou respostas.

## 12. Deploy e manutenção

Deploy da aplicação/rotas segue exclusivamente:

```text
docs/deployment/kinghost.md
```

Não use instruções antigas de Vercel Cron/Preview como procedimento operacional atual.

O Supabase continua hospedado e **não deve ser migrado para a KingHost**. Não reaplique migrations já registradas. Consulte `docs/superpowers/CURRENT_STATUS.md` antes de qualquer mudança de banco, OAuth, runtime ou rollout.
