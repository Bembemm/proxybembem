# Configuração de frete com Melhor Envio

A integração atual do Melhor Envio cobre cotação, preparação de remessa, compra explícita de etiqueta, geração separada, impressão protegida, DC-e/DACE, postagem, cancelamento e rastreamento. O fluxo atual aceito para operação individual é **PF/CPF + DC-e**, com remetente fixo cadastrado no admin e dados do destinatário vindos do snapshot imutável do pedido.

Runtime: KingHost Node.js 22.1.0. Supabase permanece hospedado separadamente e mantém OAuth/token state criptografado, catálogo, remetentes, remessas, eventos e RPCs.

## Arquitetura atual

A cotação continua usando:

```text
POST /api/v2/me/shipment/calculate
```

Bases:

```text
Sandbox:    https://sandbox.melhorenvio.com.br
Production: https://melhorenvio.com.br
```

As chamadas ao provedor são server-side com Bearer token obtido pelo token manager OAuth. O navegador nunca recebe access token, refresh token, Client Secret, CPF completo do remetente, IDs privados do provedor ou URLs transitórias de etiqueta/DACE.

## OAuth da Phase 5

O grant atual solicita exatamente estes scopes:

```text
shipping-calculate
cart-read
cart-write
orders-read
shipping-checkout
shipping-generate
shipping-print
shipping-tracking
shipping-cancel
```

Credenciais antigas sem evidência desses grants permanecem quote-only até reautorização. O refresh preserva o conjunto de scopes já autorizado; ele nunca amplia permissões sozinho.

## OAuth / callback

```text
/api/melhor-envio/oauth/callback
https://www.proxybembem.com.br/api/melhor-envio/oauth/callback
```

Uma conta/aplicativo Melhor Envio por ambiente. O aplicativo Production deve ser separado do aplicativo Sandbox e usar credenciais próprias.

Não reutilize Client ID, Client Secret, tokens ou chave de criptografia entre Sandbox e Production.

## Variáveis

```text
MELHOR_ENVIO_ENVIRONMENT=production
MELHOR_ENVIO_CLIENT_ID=
MELHOR_ENVIO_CLIENT_SECRET=
MELHOR_ENVIO_REDIRECT_URI=https://www.proxybembem.com.br/api/melhor-envio/oauth/callback
MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY=
MELHOR_ENVIO_USER_AGENT=ProxyBembem (contato@proxybembem.com.br)
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false
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

Fluxo de acesso:

```text
/admin/login -> senha -> Authenticator (TOTP) -> /admin -> Integrações -> Melhor Envio
```

A página administrativa protegida da integração é `/admin/integrations/melhor-envio`.

A segurança permanece owner UUID, senha, TOTP/AAL2 e sessão administrativa ativa. A sessão administrativa server-side expira após **30 minutos** de inatividade. Se o proprietário perder o Authenticator, a recuperação administrativa é manual pelo Supabase; não existe bypass por SMS, trusted-device ou somente senha.

Conectar/reconectar valida origem, rate limit, proprietário, AAL2 e sessão. O `state` OAuth é aleatório, hasheado, temporário e one-shot. Tokens são criptografados antes de persistir e a UI recebe apenas status sanitizado. Reauthorization é obrigatória quando o grant persistido não contém o scope necessário.

## Remetente fixo

O remetente é cadastrado em `/admin/integrations/melhor-envio` e armazenado somente no backend. No fluxo atual PF/CPF:

- CPF precisa ser válido;
- nome, e-mail, telefone e endereço precisam estar completos;
- o CEP do remetente precisa ser exatamente `SHIPPING_ORIGIN_CEP`;
- a UI mostra o CPF apenas mascarado;
- o CPF do destinatário precisa ser válido e diferente do CPF do remetente.

A aplicação também possui fundação para PJ/CNPJ + NF-e, mas o fluxo operacional aceito atualmente é PF/CPF + DC-e.

## Cotação e checkout

`public.products` continua sendo a autoridade runtime. O navegador envia IDs/quantidades e CEP, mas o servidor reconstrói preço, peso, dimensões e valor segurado antes de cotar.

Endpoint público:

```text
POST /api/shipping/quote
```

Production aceita somente Correios IDs **1 (PAC)** e **2 (SEDEX)**. Mudança de carrinho, CEP, serviço ou preço invalida a confirmação anterior. O checkout re-resolve catálogo e frete antes de criar pedido/preferência do Mercado Pago.

O pedido persiste o serviço escolhido e o `shipping_snapshot`. Uma remessa histórica é montada desse snapshot; o sistema não usa o catálogo atual para alterar dimensões, preço ou itens de um pedido já pago.

## Fluxo de remessa no admin

Para um pedido pago e `ready_to_ship`, o fluxo é deliberadamente separado:

```text
Preparar remessa
  -> revisar serviço e custo
  -> Comprar etiqueta
  -> Gerar etiqueta
  -> imprimir etiqueta e DACE
  -> confirmar postagem
  -> rastreamento
```

**Preparar remessa** valida destinatário, CPF, endereço, serviço, pacote, itens da declaração e remetente; depois insere a remessa no carrinho do Melhor Envio. Preparar não compra e não gasta saldo.

A compra é explícita e a geração é separada: **Comprar etiqueta** nunca é acionado automaticamente por pagamento aprovado, `ready_to_ship`, renderização de página, cron ou rastreamento. Antes do checkout do provedor, o backend relê o custo atual e exige confirmação do valor. Se o custo mudou, a confirmação antiga não é aceita.

**Gerar etiqueta** é outra ação explícita após compra confirmada. Gerar ou imprimir documentos não muda o pedido para `shipped`.

O V1 aceita **um pacote/volume e uma etiqueta por pedido** ativo. Snapshot sem pacote utilizável, com múltiplos pacotes ou inconsistente falha fechado em vez de inventar dimensões ou trocar o serviço silenciosamente.

## Gate de gasto em Production

Por padrão e durante aceitação sem gasto:

```text
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false
```

Com `false`, o serviço de compra falha fechado antes de qualquer checkout/gasto no provedor. Preparação, cotação, OAuth, configuração do remetente e rastreamento continuam disponíveis.

A capacidade de compra só deve ser habilitada intencionalmente para um pedido real escolhido pelo proprietário:

```text
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=true
```

Depois da alteração privada no ambiente Production, reinicie a aplicação pelo painel KingHost. Nunca commite esse valor de Production como política permanente nem habilite a flag para contornar erro de validação.

Se uma tentativa de compra tiver resultado desconhecido/timeout, **não clique novamente**. Use a reconciliação de compra para descobrir se o provedor comprou ou não e evitar gasto duplicado.

## DC-e e DACE

No modo PF/CPF, a remessa usa declaração de conteúdo/DC-e. Os itens da declaração vêm dos itens imutáveis do pedido: descrição, quantidade e valor unitário. O browser não pode alterar esses valores para a remessa.

Após compra e geração confirmadas, a etiqueta e o **DACE** são acessados por rotas administrativas protegidas. URLs transitórias do provedor não são persistidas nem expostas ao cliente. O DACE acompanha a remessa conforme o fluxo de DC-e do provedor.

## Postagem e status do pedido

Compra, geração e impressão não significam postagem. O pedido só pode avançar de `ready_to_ship` para `shipped` por:

- ação administrativa explícita de confirmar postagem; ou
- evidência confiável do rastreamento de que a transportadora aceitou a remessa.

Entrega confiável pode avançar `shipped -> completed`. Rastreamento antigo ou regressivo nunca move o estado para trás.

## Rastreamento

Rota interna protegida:

```text
/api/internal/melhor-envio/tracking
```

O rastreamento roda em cadência **horária** e usa somente a capacidade `shipping-tracking`; ele não pode comprar, gerar ou cancelar etiquetas. A sincronização é monotônica e deduplicada.

O cliente autenticado vê apenas a projeção sanitizada em:

```text
/minha-conta/pedidos/{uuid}
```

Não existe endpoint público de rastreamento expondo dados privados do remetente ou IDs internos do provedor.

## Renovação automática

Tokens usam AES-256-GCM, versionamento e lease atômica. O token manager refresca preventivamente e, após falha de autenticação reconhecida, faz no máximo um retry com versão nova. Refresh definitivamente rejeitado marca `reauthorization_required`.

Rota de manutenção:

```text
/api/internal/melhor-envio/refresh
```

Aceita `CRON_SECRET` via `X-CRON-AUTH` (Cron KingHost) ou `Authorization: Bearer` para diagnóstico controlado. A cadência operacional do refresh continua diária às **03:17**. A resposta é sanitizada e nunca contém tokens.

## Cancelamento

Cancelamento de remessa é uma ação administrativa separada e exige **confirmação explícita**. Não é disparado por cancelamento do pedido nem realiza reembolso do Mercado Pago.

Uma operação de cancelamento com resultado ambíguo entra em reconciliação/atenção; ela não envia uma segunda chamada cega ao provedor. Consequências de cancelamento e eventual estorno do frete devem ser revisadas antes de cancelar uma etiqueta real.

## Segurança e isolamento

- `shipping_sender_profiles`, `shipments` e `shipment_events` são backend-only;
- browser não possui CRUD direto nessas tabelas;
- mutações passam por RPCs restritas e `SECURITY DEFINER` com `search_path` fixo;
- CPF completo, token OAuth, Authorization header, provider IDs e URLs de impressão não entram na projeção do cliente;
- cliente A não pode obter a remessa do cliente B;
- renderização, webhook de pagamento e `ready_to_ship` não podem alcançar o checkout da etiqueta;
- compra usa rate limit separado das demais mutações administrativas.

## Checklist Production

- `MELHOR_ENVIO_ENVIRONMENT=production`;
- aplicativo Production separado do Sandbox;
- callback produtivo exato;
- todos os nove scopes Phase 5 autorizados;
- remetente fixo cadastrado e CEP igual a `SHIPPING_ORIGIN_CEP`;
- destinatário com nome, e-mail, telefone, CPF e endereço válidos;
- CPF do destinatário diferente do CPF do remetente;
- PAC/SEDEX IDs 1/2 preservados do checkout;
- exatamente um pacote reconhecido no V1;
- preparação não compra etiqueta;
- `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` até aprovação explícita para pedido real;
- compra e geração são ações separadas;
- nenhuma compra automática;
- geração/impressão não marca `shipped`;
- cancelamento exige confirmação;
- rastreamento horário usa somente leitura do provedor;
- refresh OAuth diário às 03:17;
- customer tracking somente em `/minha-conta/pedidos/{uuid}`;
- nenhum segredo ou CPF completo aparece em logs/respostas para browser.

## Deploy / manutenção

Use somente `docs/deployment/kinghost.md`. Supabase não deve ser migrado para KingHost e migrations já aplicadas não devem ser reaplicadas. Consulte `docs/superpowers/CURRENT_STATUS.md` antes de mudanças de OAuth, banco, runtime ou rollout.