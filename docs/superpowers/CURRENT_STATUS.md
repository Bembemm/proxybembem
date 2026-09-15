# ProxyBembem — Current Status

**Updated:** 2026-09-15  
**Active branch:** `feat/phase-9-hardening-final-rollout`  
**Canonical integration branch:** `main`

Este arquivo é o checkpoint operacional curto. A visão consolidada está em `docs/PROJECT_MASTER_OVERVIEW.md`.

## Estado atual

- Phase 0 — Design + Planning: **COMPLETE**.
- Phase 1 — Data + Audit Foundation: **COMPLETE / APPLIED**.
- Phase 2 — Admin Orders + Fulfillment: **COMPLETE / ACCEPTED**.
- Phase 3 — Customer Account + Private Orders: **COMPLETE / PRODUCTION ACCEPTED**.
- Phase 4 — Catalog + Products Admin + Navigation: **IMPLEMENTATION COMPLETE / AUTOMATED GREEN**; o browser smoke amplo histórico continua pendente.
- Phase 5 — Melhor Envio + Labels + Tracking: **COMPLETE / OWNER ACCEPTED**.
- Phase 6 — Transactional Notifications: **COMPLETE / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN**.
- Phase 7 — Store Settings: **COMPLETE / HOSTED SUPABASE VALIDATED / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN**.
- Phase 8 — Dashboard Metrics + Attention Center: **IMPLEMENTATION COMPLETE / HOSTED VALIDATED / CANDIDATE DEPLOYED**; smoke autenticado `/admin` ainda **PENDING OWNER SMOKE**, portanto não registrar como Production accepted.
- Phase 9 — Hardening + Final Rollout: **IN PROGRESS / REPOSITORY HARDENING + HOSTED SUPABASE VALIDATED**; final candidate rollout e smoke manual ainda pendentes.

## Phase 9 — checkpoint atual

Branch ativa: `feat/phase-9-hardening-final-rollout`.

### Hardening concluído

- inventário de rotas/mutations sensíveis e contrato de regressão concluídos;
- revisão de auth/admin/customer ownership/origin/rate-limit/no-store/secret boundaries sem lacuna real demonstrada;
- matriz consolidada de concorrência/idempotência para pagamento, checkout lease, fulfillment, produtos, Store Settings, shipments, notificações, recovery grants, attention flags e dashboard;
- revisão de `SECURITY DEFINER`, fixed `search_path`, execute grants e exposição de browser roles;
- seis índices `unused` analisados individualmente; nenhum removido sem prova de redundância segura;
- checklist final manual criado preservando explicitamente a dívida de smoke Phase 4 e Phase 8.

### Final automated application candidate

`cdb3f863336237ab49f9b91cca20f0d876aa75c7` — `test: preserve Phase 9 manual acceptance gates`.

GitHub Actions CI #1648 / run `34983376962`: **PASS**.

No mesmo SHA o job `verify` passou:

- exact KingHost Node runtime setup;
- Node version check;
- frozen pnpm install;
- typecheck;
- `build:kinghost`;
- private-order route contract;
- KingHost startup adapter smoke;
- full `pnpm test`.

Commits posteriores de Phase 9 são documentação/evidência hospedada; não alteraram o runtime de aplicação após esse candidate.

### Hosted Supabase Phase 9

Antes da escrita, a migration history hospedada terminava em `20260915092352 dashboard_metrics_attention_center` para a Phase 8.

Foi aplicada **uma única vez e somente** a migration:

- repo: `supabase/migrations/202609150002_phase9_customer_profiles_rls_performance.sql`;
- hosted version: `20260915145834`;
- hosted name: `phase9_customer_profiles_rls_performance`.

Validação pós-DDL confirmou:

- RLS de `public.customer_profiles` continua habilitado;
- select/insert/update continuam owner-scoped para `authenticated`;
- as três policies agora usam `(select auth.uid()) = id` sem alterar ownership;
- grants de browser relevantes continuam `SELECT`, `INSERT`, `UPDATE` para `authenticated`;
- os 3 antigos warnings `auth_rls_initplan` desapareceram do advisor de performance;
- permanecem somente os 6 INFO `unused_index` já auditados e mantidos;
- `admin_get_dashboard_snapshot()` continua service-role-only, `SECURITY DEFINER`, `search_path=''`;
- `customer_list_orders` e `customer_get_order` continuam authenticated `SECURITY DEFINER` por desenho, owner-scoped por `auth.uid()`;
- nenhuma nova finding de segurança Phase 9 foi introduzida.

Evidência: `docs/superpowers/phase-9/HOSTED_VALIDATION.md`.

### Leaked-password protection

O advisor hospedado ainda reporta **Leaked Password Protection Disabled**. A documentação atual do Supabase informa que o recurso é disponível no **Pro Plan e acima**. A integração Supabase disponível nesta sessão não expõe leitura/escrita da configuração Auth nem prova do tier atual; portanto não foi ativado às cegas e não será descrito como habilitado.

Disposition: **PLATFORM_LIMITATION / OWNER DASHBOARD CHECK**.

## Phase 8 — estado real preservado

A Phase 8 possui implementação, hosted migration e reconciliação validadas.

- hosted migration: `20260915092352 dashboard_metrics_attention_center`;
- rollout candidate: `773504f0e68220c1bda0ec706c4e62f8d542e433`;
- CI #1631 / run `34960866441`: **PASS**;
- candidate KingHost foi deployado;
- dashboard permanece read-only e server-side;
- snapshot financeiro/operacional foi reconciliado contra dados hospedados reais.

O que **não** deve ser inventado: o owner não concluiu o smoke autenticado de `/admin`. Portanto Phase 8 não deve ser marcada como Production accepted até esse smoke ser realmente observado.

## Phase 5 — evidência histórica preservada

Phase 5 permanece **complete / owner accepted**.

- caminho Production **non-spending / sem gasto** chegou ao carrinho real do Melhor Envio com shipment local em `in_cart`;
- custo observado no fixture: **R$ 23,69**;
- `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` continua default seguro fora de janela deliberada;
- Task 18 **owner accepted / owner-reported** em 2026-09-11;
- Task 19 **complete / concluída**;
- Task 20 **owner accepted / owner-reported** em 2026-09-11.

Migrations Phase 5 preservadas:

- `202609080002_melhor_envio_oauth_scope_grants.sql`
- `202609080003_shipments_foundation.sql`
- `202609080004_shipment_operations.sql`
- `202609080005_shipment_cancel_reconciliation.sql`
- `202609080006_customer_shipment_projection.sql`
- `20260909194848_shipments_sender_profile_fk_index.sql`

## Baseline / invariantes ainda válidos

- Supabase `public.products` é a única autoridade runtime de catálogo.
- Browser nunca decide preço, frete, total, ownership ou status financeiro.
- Iniciar pagamento exige cliente Supabase autenticado/verificado.
- Mercado Pago continua autoridade financeira.
- Pedidos do cliente são privados em `/minha-conta/pedidos/{uuid}`.
- Não restaurar guest checkout, `/pedido/[token]` ou guest claim.
- Admin exige owner UUID + senha + TOTP/AAL2 + sessão administrativa ativa.
- Produto usa somente `draft | published | archived`; sem hard delete.
- Compra de etiqueta Melhor Envio é explícita e fail-closed; `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` permanece default seguro fora de janela deliberada.
- Migrations hospedadas não são regravadas/reaplicadas.
- Falha de e-mail nunca altera pagamento, fulfillment ou shipping.
- Resend Open Tracking e Click Tracking permanecem OFF.
- Store Settings não contém provider/infrastructure secrets.
- Dashboard/Attention Center são read-only e não resolvem flags nem mutam verdade financeira/operacional.
- Não remover índice apenas para reduzir advisor INFO.
- Não fazer merge/rebase/force/delete de branch sem aprovação explícita do owner.
- Não usar PM2 CLI para reiniciar a aplicação KingHost; restart somente pelo painel.

## Pendências antes de fechar Phase 9

1. Reconciliar os documentos canônicos da Phase 9 e validar CI do fechamento documental.
2. Fazer **um único rollout final** do exact runtime candidate na KingHost, mantendo `umask 022`.
3. Reiniciar somente pelo painel KingHost.
4. Validar public HTTP health.
5. Executar o smoke manual final registrado em `docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md`, incluindo Phase 4 product-admin debt, Phase 8 authenticated `/admin`, private customer order, admin MFA/session, Store Settings, shipping safe state e notification path.
6. Só então criar `FINAL_ACCEPTANCE.md` e marcar Phase 9 como encerrada.

A branch **não está integrada em `main`** e nenhuma integração deve ocorrer sem aprovação explícita do proprietário.
