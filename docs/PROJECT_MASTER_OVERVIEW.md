# ProxyBembem — Visão Geral Mestre do Projeto

**Atualizado em:** 2026-09-14  
**Estado consolidado:** Phases 0–6 concluídas; Phase 6 integrada na `main`; Phases 7–9 ainda não iniciadas.

Este documento é o ponto de entrada canônico para entender o projeto como ele existe hoje. Ele consolida as decisões que ficaram espalhadas entre branches, planos, specs, runbooks e documentos de aceitação. Quando uma anotação histórica de uma branch antiga divergir deste arquivo, da implementação atual ou do estado hospedado, **este arquivo e a realidade de `main`/Production prevalecem**.

Os arquivos em `docs/superpowers/plans/` e `docs/superpowers/specs/` continuam no repositório como histórico de design/TDD. Eles não devem ser interpretados como checklists atuais apenas porque possuem passos RED/GREEN ou pendências que fizeram sentido durante a implementação.

---

## 1. Baseline atual

### Git / CI

- Branch canônica de integração: `main`.
- Merge da Phase 6 na `main`: `95ac936ca11dfd695734138e579eb97085714980`.
- GitHub Actions da `main` após o merge: run `34880603149` / #1529 — **PASS**.
- A PR #4 (`Phase 6: transactional notifications`) foi integrada por merge normal após autorização explícita do proprietário.
- A PR #1 (`prepare backend checkout architecture`) era uma preparação histórica e foi fechada sem merge em 2026-09-14, porque sua implementação foi superada pela arquitetura atual.

### Production

- Aplicação: KingHost.
- Runtime: Node.js **22.1.0**.
- pnpm operacional: major **10**.
- Backend/Auth/banco: Supabase hospedado separadamente.
- Projeto Supabase: `ProxyBembem`.
- Runtime de aplicação atualmente comprovado em Production antes da consolidação: `c8c2bb20f1c265729c4d4aee7fe65a91e2e1cc4c`.
- Esse runtime já contém as rotas, worker, templates, admin e compatibilidade GET do cron necessários à Phase 6.
- As duas correções finais da Phase 6 foram funções/migrations do banco e já estão aplicadas no Supabase hospedado; por isso não exigiram novo deploy da aplicação KingHost.
- Assim, existe uma diferença intencional e conhecida entre o SHA atual de `main` e o SHA da aplicação atualmente servida. Um deploy futuro a partir de `main` naturalmente elimina essa diferença.

### Provedores externos

- Mercado Pago: autoridade financeira.
- Melhor Envio: cotação/remessa/etiqueta/rastreamento.
- Resend: e-mails transacionais e recuperação de senha.
- KingHost: runtime Next.js/Node e camada pública nginx/webroot.
- Supabase: Auth, PostgreSQL, Storage, dados operacionais e RPCs.

---

## 2. Arquitetura atual

O ProxyBembem é um **monólito modular em Next.js + TypeScript**, com fronteiras server-side claras para checkout, autenticação, administração, pagamentos, frete e notificações.

A aplicação é dividida operacionalmente entre:

- **browser/UI:** catálogo, carrinho, formulários, área da conta e telas administrativas;
- **Next.js server:** validação, autorização, checkout, integração com provedores e projeções sanitizadas;
- **Supabase:** persistência, Auth, Storage, RLS, RPCs, eventos e auditoria;
- **Mercado Pago:** verdade financeira;
- **Melhor Envio:** verdade de operações de remessa/rastreamento;
- **Resend:** transporte e callbacks de e-mail;
- **KingHost:** execução do app e publicação dos assets do build.

Não existe uma segunda implementação de backend que deva ser ressuscitada de branches antigas.

---

## 3. Invariantes que não devem regredir

1. O browser nunca é autoridade para preço, subtotal, frete, total, `customer_id`, status financeiro ou ownership do pedido.
2. `public.products` no Supabase é a única autoridade de catálogo em runtime. Não restaurar `data/products.ts` como fallback de produção.
3. Produto público precisa estar `published`; lifecycle é exatamente `draft | published | archived`; não existe hard delete administrativo.
4. Iniciar pagamento exige cliente Supabase autenticado e verificado.
5. Ownership do pedido vem do UUID/e-mail confiável da sessão Auth no servidor.
6. Pedidos privados usam `/minha-conta/pedidos/{uuid}`. Não restaurar `/pedido/[token]`, guest claim ou guest payment.
7. Mercado Pago é a única autoridade financeira. Fulfillment/admin nunca “marca como pago/reembolsado” localmente.
8. Pedido histórico preserva snapshot de compra/frete; catálogo atual não reescreve pedido já criado/pago.
9. Admin exige owner UUID + senha + TOTP/AAL2 + sessão administrativa server-side ativa; respostas administrativas permanecem no-store.
10. Compra de etiqueta Melhor Envio é sempre explícita e fail-closed. Preparar, comprar, gerar, imprimir, postar e cancelar são operações diferentes.
11. `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` é o default seguro fora de uma janela deliberada de compra real.
12. Timeout/resultado ambíguo de compra não permite retry cego; primeiro reconcilia.
13. Gerar/imprimir etiqueta ou DACE não marca o pedido como enviado.
14. Rastreamento pode avançar estados somente com evidência confiável e nunca deve regredir estado.
15. Notificação transacional não muda verdade financeira, fulfillment ou shipping.
16. Não existe tracking de abertura/clique do Resend e não existe automação de marketing/WhatsApp nesta arquitetura.
17. Segredos, tokens, TOTP, service keys, CPF completo e IDs privados de provedores não vão para Git, browser, logs públicos ou documentação.
18. Migration já aplicada no Supabase não é reescrita nem reaplicada; correções são aditivas.

---

## 4. Fluxos principais do produto

### 4.1 Catálogo e carrinho

- Catálogo público resolve apenas produtos `published` do Supabase.
- Carrinho pode existir antes do login.
- Alterações de preço/publicação são reconciliadas contra o catálogo atual.
- Checkout re-resolve IDs/quantidades, preço e dados físicos server-side.

### 4.2 Checkout e Mercado Pago

- Catálogo/carrinho/cotação são públicos.
- `POST /api/checkout` exige identidade verificada antes de criar/reservar o pedido.
- O pedido é persistido antes do redirecionamento para o Mercado Pago.
- O servidor cria a preferência usando valores reconstruídos no backend.
- Retornos voltam para `/minha-conta/pedidos/{order-id}`.
- O webhook Mercado Pago valida assinatura, consulta o pagamento no provedor, valida referência/valor/moeda e aplica transição atômica.
- Retorno do navegador nunca é prova de pagamento.

### 4.3 Conta do cliente

- Cadastro/login Supabase.
- E-mail verificado para iniciar pagamento.
- Perfil privado e pedidos owner-scoped.
- Recuperação de senha usa grant durável controlado pela aplicação; abordagens antigas foram substituídas.
- Cliente enxerga apenas projeções sanitizadas dos próprios pedidos/remessas.

### 4.4 Admin

Principais superfícies:

- `/admin`
- `/admin/pedidos`
- `/admin/pedidos/[id]`
- `/admin/producao`
- `/admin/produtos`
- `/admin/produtos/[id]`
- `/admin/produtos/novo`
- `/admin/integrations/melhor-envio`

Autorização depende de owner UUID, senha, TOTP/AAL2 e sessão administrativa ativa. A barra lateral desktop/drawer mobile é a navegação administrativa atual.

### 4.5 Melhor Envio

Fluxo operacional aceito hoje: **PF/CPF + DC-e/DACE**, com fundação para PJ/CNPJ + NF-e.

Scopes atuais:

- `shipping-calculate`
- `cart-read`
- `cart-write`
- `orders-read`
- `shipping-checkout`
- `shipping-generate`
- `shipping-print`
- `shipping-tracking`
- `shipping-cancel`

Fluxo administrativo:

```text
Preparar remessa
  -> revisar serviço/custo
  -> Comprar etiqueta
  -> Gerar etiqueta
  -> imprimir etiqueta/DACE
  -> confirmar postagem
  -> rastrear
```

Production aceita PAC/SEDEX atuais conforme a política implementada; V1 trabalha com um pacote/volume e uma etiqueta por pedido ativo.

### 4.6 E-mail transacional / Resend

Arquitetura: outbox durável no Supabase + worker da aplicação + Resend + webhook Svix assinado.

Tipos exatamente suportados:

1. `payment_approved`
2. `production_started`
3. `ready_to_ship`
4. `shipped`
5. `delivered`
6. `canceled`
7. `refunded`
8. `charged_back`

Regras principais:

- nenhum e-mail de pedido antes de aprovação financeira autoritativa;
- cancelamento administrativo de pedido nunca pago fica silencioso;
- worker processa no máximo 25 por chamada;
- no máximo 3 tentativas automáticas, aproximadamente +5 min e +30 min;
- manual resend cria nova linha auditável em vez de sobrescrever histórico;
- callbacks antecipados são reconciliados quando `provider_message_id` passa a existir;
- callbacks atrasados são ligados ao histórico sem rebaixar estado terminal mais forte;
- `delivered` não volta para `sent`;
- corpo de webhook é limitado a 64 KiB;
- Open Tracking = OFF e Click Tracking = OFF em Production.

---

## 5. Roadmap consolidado

| Fase | Estado | Resultado atual |
| --- | --- | --- |
| 0 — Design + Planning | **COMPLETE** | Arquitetura modular, limites de segurança e estratégia operacional definidos. |
| 1 — Data + Audit Foundation | **COMPLETE / APPLIED** | Fulfillment, eventos, auditoria e attention flags. |
| 2 — Admin Orders + Fulfillment | **COMPLETE / ACCEPTED** | Pedidos/admin/produção e transições protegidas. |
| 3 — Customer Account + Private Orders | **COMPLETE / PRODUCTION ACCEPTED** | Conta verificada, pedidos privados, recuperação de senha. |
| 4 — Catalog + Products Admin + Navigation | **IMPLEMENTATION COMPLETE** | Supabase catalog, admin de produtos e sidebar; antigo smoke manual amplo da Stage 3 não foi integralmente refeito. |
| 5 — Melhor Envio + Labels + Tracking | **COMPLETE / OWNER ACCEPTED** | OAuth, remessas, compra explícita, geração, DACE, postagem e tracking. |
| 6 — Transactional Notifications | **COMPLETE / PRODUCTION ACCEPTED** | Outbox, worker, Resend, webhook, admin history e resend auditável. |
| 7 — Store Settings | **NOT STARTED** | Próxima fase prevista. |
| 8 — Dashboard Metrics + Attention Center | **NOT STARTED** | Métricas/filas operacionais confiáveis. |
| 9 — Hardening + Final Rollout | **NOT STARTED** | Revisão final de auth, isolation, origins, rate limit, secrets, concorrência e smoke. |

---

## 6. Banco / migrations por domínio

A série de migrations em `supabase/migrations/` é a história aditiva do schema. Não reaplicar versões já presentes na migration history hospedada.

### Pedidos, pagamento e checkout

- criação de pedidos;
- hardening de checkout/frete;
- eventos financeiros atômicos;
- lease de preferência checkout;
- CPF do destinatário adicionado posteriormente.

### Admin e contas

- sessões administrativas;
- foundation de operações/auditoria de pedidos;
- operações de fulfillment;
- contas/pedidos privados;
- grants duráveis de recuperação de senha.

### Catálogo

- `product_catalog`;
- grants do service role;
- correção posterior de least privilege.

### Melhor Envio / remessas

- OAuth e escopos;
- `shipments`/`shipment_events`/sender profiles;
- operações, cancelamento/reconciliação e projeção do cliente;
- índice posterior de FK do sender profile.

### Notificações

Migrations hospedadas finais da Phase 6:

- `20260913011820 transactional_notifications_foundation`
- `20260913011838 transactional_notification_triggers`
- `20260913013454 transactional_notification_advisor_indexes`
- `20260913022001 transactional_notification_webhook_reconciliation`
- `20260914180352 transactional_notification_final_hardening`
- `20260914181035 transactional_notification_webhook_backfill`

As duas últimas corrigem cancelamento sem pagamento, link de webhook atrasado e o único orphan histórico conhecido.

---

## 7. Deploy e operação KingHost

Runbook detalhado: `docs/deployment/kinghost.md`.

Estrutura:

- aplicação Node/Next em `~/apps_nodejs/proxybembem`;
- assets públicos/Next também publicados em `~/www` para o nginx da KingHost;
- entrypoint `proxybembem/app.js`;
- porta vem do ambiente KingHost; não hard-code.

Deploy normal:

```bash
cd ~/apps_nodejs/proxybembem
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 deploy:kinghost
```

Depois: restart pelo painel KingHost. Não iniciar PM2 manualmente.

Crons/rotas operacionais relevantes:

- Melhor Envio OAuth refresh: `GET /api/internal/melhor-envio/refresh`, diariamente às 03:17.
- Melhor Envio tracking: rota interna de tracking, operação somente leitura, cadência horária aceita.
- Notificações: `GET https://www.proxybembem.com.br/api/internal/notifications/process`, a cada 5 minutos.
- Webhook Resend: `https://www.proxybembem.com.br/api/webhooks/resend`.
- Webhook Mercado Pago: `https://www.proxybembem.com.br/api/mercadopago/webhook`.

### Incidente de permissões de assets em 2026-09-14

Durante configuração manual de segredo, um shell ficou com `umask 077`; um build posterior criou assets `/_next/static` em modo `600`. O nginx devolveu 403 para CSS/JS e o site apareceu sem estilo.

Foi corrigido restaurando `umask 022` e tornando os assets publicados legíveis. O `.env.production` continuou privado em `600`.

Por decisão do proprietário, **o script de deploy não foi modificado para contornar `umask 077`**. Regra operacional: não deixar um `umask` restritivo ativo ao executar build/deploy. Não afrouxar as permissões do `.env.production`.

---

## 8. Verificação / CI

A CI atual valida, entre outras coisas:

- runtime exato Node 22.1.0;
- install com lockfile congelado;
- typecheck;
- build KingHost;
- contrato de rotas privadas;
- startup adapter KingHost;
- suíte automatizada completa.

O merge da Phase 6 na `main` passou na run #1529 (`34880603149`).

Testes de regressão cobrem áreas que já causaram problemas reais, incluindo admin cache/no-store, order number legado, checkout, auth, Melhor Envio, shipment state, no-auto-spend, Resend, webhook races e hardening de notificações.

---

## 9. Aceitação real já observada

### Phase 3

Conta/pedidos privados: produção aceita.

### Phase 4

Stage 1/2 aceitas em produção. Stage 3 está implementada e automatizada, mas o checklist browser amplo original não foi integralmente refeito.

### Phase 5

- OAuth Production reautorizado com os nove scopes;
- caminho controlado de preparação sem gasto chegou ao carrinho do Melhor Envio;
- custo observado no fixture controlado: R$ 23,69;
- compra real foi posteriormente aceita pelo proprietário como Task 18;
- smoke final foi aceito pelo proprietário como Task 20.

### Phase 6

- domínio Resend verificado em `sa-east-1`;
- envio habilitado;
- Open/Click Tracking OFF;
- webhook operacional assinado habilitado;
- e-mail `production_started` real do fixture chegou a `delivered`;
- histórico apareceu no admin;
- reenvio manual criou linha nova ligada à original e também chegou a `delivered`;
- fila final sem itens vencidos ativos;
- único webhook conhecido sem vínculo foi backfilled; known orphan count = 0.

Existe uma linha `failed` antiga do primeiro fixture sintético inválido da Phase 6. Ela é histórica/auditável e não representa fila pendente.

---

## 10. Revisão das branches antigas

A consolidação verificou as branches remanescentes antes de qualquer limpeza. Branch antiga não deve ser mesclada apenas por existir: a `main` atual é a autoridade.

### Contidas/superadas pela `main`

Estas branches não possuem trabalho atual que precise ser integrado e podem ser removidas depois da consolidação:

- `feat/admin-dashboard-expansion`
- `feat/admin-dashboard-expansion-red-profile-cache`
- `feat/profile-cache-regression-test-temp`
- `feat/checkout-mercadopago`
- `feat/password-recovery-token-hash`
- `feat/transactional-notifications`
- `no-op`
- `please-ignore-this`
- `spec/password-recovery-token-hash`
- `tmp-ignore-password-recovery-token-hash`
- `work/password-recovery-implicit`
- `work/password-recovery-resend-tokenhash`
- `work/password-recovery-token-hash`
- `tdd/kinghost-port-variable`
- `tdd/kinghost-task1`
- `tdd/kinghost-task1b`
- `tdd/kinghost-task1c`
- `tdd/kinghost-webpack`
- `vercel-retry-803d148`

Várias dessas são aliases/checkpoints temporários que apontam para SHAs já ancestrais da `main`.

### Branches divergentes revisadas manualmente

#### `feat/admin-dashboard-expansion-debug-red`

Possuía um commit RED adicional com `tests/admin-production-regressions.test.ts`. A `main` atual já contém uma versão mais nova/superset desse arquivo, incluindo os mesmos testes de credencial inválida, no-store do admin e order number legado. Não há código a resgatar.

#### `tdd/kinghost-pm2-entrypoint`

Possuía um commit de teste adicional para runtime KingHost. A `main` atual já contém cobertura mais nova para variáveis de porta, portas inválidas, bind em `0.0.0.0` e standalone output. Não há implementação a resgatar.

#### `agent/prepare-backend-checkout`

Branch histórica anterior à arquitetura atual. O documento `docs/backend-checkout.md` defendia corretamente que o navegador nunca fosse autoridade para preços/frete/pagamento, que segredos ficassem no servidor, que o pedido fosse persistido antes do redirect e que webhook confirmasse pagamento de forma idempotente. **Esses princípios foram preservados neste documento e na implementação atual.**

O código antigo (`lib/catalog.ts`, quote inicial, catálogo estático etc.) foi superado por Supabase `public.products`, checkout autenticado, Mercado Pago real e Melhor Envio atual. Não deve ser merged.

#### `work/shipping-checkout-hardening`

Branch histórica com uma implementação paralela/antiga de cotação e Melhor Envio. Ela também tocava `data/products.ts`, o que conflita com a regra atual de Supabase como única autoridade de catálogo. O sistema atual possui uma implementação Phase 5 muito mais completa e aceita. Não deve ser merged.

### Pull requests históricas

- PR #1: fechada sem merge durante esta consolidação; arquitetura superada.
- PR #4: Phase 6 integrada na `main` após aceitação.

---

## 11. Pendências e riscos conhecidos para a próxima revisão

Estes itens **não significam que as Phases 0–6 falharam**; são o backlog real conhecido para auditoria/hardening futuro:

1. **Phase 4 browser smoke amplo:** o antigo checklist completo de produto CRUD/image/conflict/cache não foi integralmente refeito após Stage 3. Há cobertura automatizada e uso posterior de várias superfícies, mas não inventar evidência manual que não ocorreu.
2. **Admin cache header manual:** no-store é coberto por testes, porém a observação manual do header autenticado não foi registrada no último smoke.
3. **Supabase Auth leaked-password protection:** advisor indica que está desabilitado; avaliar na Phase 9.
4. **`customer_profiles` `auth_rls_initplan`:** advisor reporta três oportunidades de performance nas policies; não é autorização quebrada, mas merece otimização futura.
5. **Unused indexes:** advisor lista índices ainda não utilizados; tratar como informativo até existir volume/evidência suficiente, não remover cegamente.
6. **RLS sem policy em tabelas backend-only:** é intencional onde browser CRUD está revogado. Não adicionar policies só para silenciar advisor.
7. **Drift `main` x runtime KingHost:** conhecido e intencional após o merge/documentação/DB-only hardening. Antes do próximo rollout grande, registrar o SHA exato que será implantado.
8. **Incidente `umask`:** não repetir build/deploy com `umask 077` ativo no shell.
9. **Fixture Phase 6:** linha failed histórica do payload sintético inválido foi preservada por auditoria; não é retry ativo.
10. **Branches antigas:** devem ser removidas após esta consolidação para reduzir ambiguidade. Não usar branch histórica como base de trabalho novo.

---

## 12. Checklist recomendado antes de começar Phase 7

1. Confirmar `main` limpa e CI verde.
2. Remover branches históricas já classificadas como superadas.
3. Trabalhar a próxima fase sempre a partir da `main` atual.
4. Antes de mudanças de banco, comparar migrations Git x hosted migration history.
5. Não reabrir decisões já aceitas sem uma regressão concreta.
6. Fazer uma revisão direcionada das pendências acima, especialmente segurança/Auth/advisors e smoke Phase 4, antes ou dentro da Phase 9.
7. Para cada nova fase: branch curta, testes, PR, merge explícito e atualização deste documento no final.

---

## 13. Próxima fase prevista

### Phase 7 — Store Settings

Ainda não iniciada. A intenção do roadmap é criar apenas configurações operacionais/comerciais tipadas e allowlisted. Segredos de infraestrutura/provedores continuam exclusivamente em ambiente privado e **não** viram store settings.

Depois:

- Phase 8 — Dashboard Metrics + Attention Center;
- Phase 9 — Hardening + Final Rollout.

---

## 14. Documentos de referência que continuam válidos

Para detalhes especializados, consultar:

- `docs/PROJECT_MASTER_OVERVIEW.md` — este documento, visão geral canônica;
- `docs/deployment/kinghost.md` — deploy e runtime;
- `docs/payments-setup.md` — Mercado Pago/checkout;
- `docs/shipping-setup.md` — Melhor Envio/remessas;
- `docs/superpowers/CURRENT_STATUS.md` — evidências detalhadas acumuladas até a consolidação;
- `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` — roadmap e decisões de design;
- `docs/superpowers/plans/` e `docs/superpowers/specs/` — histórico de implementação/design.

Ao continuar o projeto, comece por este arquivo e pela `main`, não por uma branch antiga.