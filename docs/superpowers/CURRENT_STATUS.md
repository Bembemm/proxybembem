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
- Phase 4 — Catalog + Products Admin + Navigation: **COMPLETE / OWNER ACCEPTED**; o smoke browser histórico foi concluído em 2026-09-15.
- Phase 5 — Melhor Envio + Labels + Tracking: **COMPLETE / OWNER ACCEPTED**.
- Phase 6 — Transactional Notifications: **COMPLETE / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN**.
- Phase 7 — Store Settings: **COMPLETE / HOSTED SUPABASE VALIDATED / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN**.
- Phase 8 — Dashboard Metrics + Attention Center: **COMPLETE / HOSTED VALIDATED / PRODUCTION ACCEPTED**.
- Phase 9 — Hardening + Final Rollout: **COMPLETE / HOSTED VALIDATED / FINAL CANDIDATE DEPLOYED / PRODUCTION ACCEPTED**.

O projeto está **tecnicamente e manualmente aceito em Production** no escopo das Phases 0–9. A branch final ainda **não está integrada em `main`**; isso continua dependendo de aprovação explícita do proprietário.

## Phase 9 — fechamento

Branch ativa: `feat/phase-9-hardening-final-rollout`.

### Hardening concluído

- inventário de rotas/mutations sensíveis e contrato de regressão concluídos;
- revisão de auth/admin/customer ownership/origin/rate-limit/no-store/secret boundaries sem lacuna real demonstrada;
- matriz consolidada de concorrência/idempotência para pagamento, checkout lease, fulfillment, produtos, Store Settings, shipments, notificações, recovery grants, attention flags e dashboard;
- revisão de `SECURITY DEFINER`, fixed `search_path`, execute grants e exposição de browser roles;
- seis índices `unused` analisados individualmente; nenhum removido sem prova de redundância segura;
- Phase 4 browser debt, Phase 8 dashboard smoke e Phase 9 final authenticated/business smoke concluídos e aceitos pelo owner em 2026-09-15.

### Final application runtime candidate

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

Commits posteriores ao runtime candidate são aceitação/testes/documentação e não exigem novo deploy de runtime enquanto não alterarem código de aplicação.

### Hosted Supabase Phase 9

Antes da escrita, a migration history hospedada terminava em `20260915092352 dashboard_metrics_attention_center` para a Phase 8.

Foi aplicada uma única vez e somente a migration:

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

O advisor hospedado continua reportando **Leaked Password Protection Disabled**. O tooling conectado não expôs leitura/escrita da configuração Auth nem prova do tier do projeto; portanto o recurso não foi ativado às cegas.

Disposition final: **PLATFORM_LIMITATION / OWNER DASHBOARD CHECK**. É uma pendência de plataforma/configuração documentada, não uma finding crítica/alta desconhecida da aplicação.

### Final KingHost rollout

O owner executou o rollout final do exact runtime candidate e informou restart concluído pelo painel KingHost, sem uso de PM2 CLI.

Evidência terminal fornecida pelo owner em 2026-09-15:

- `git rev-parse HEAD` => `cdb3f863336237ab49f9b91cca20f0d876aa75c7`;
- `curl -sSI https://www.proxybembem.com.br/ | head -n 10` => `HTTP/2 200`;
- resposta pública apresentou CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e HSTS;
- o primeiro status pós-build mostrou somente `M next-env.d.ts`, e o diff continha apenas referências de tipos geradas pelo Next.js durante build;
- após `git restore next-env.d.ts`, `git status -sb` retornou somente `## HEAD (no branch)`, sem modificações locais.

O checkout detached é intencional neste rollout para manter Production pinada no exact candidate aprovado.

### Final owner smoke

Em 2026-09-15 o owner recebeu o checklist completo restante e reportou **“tudo ok”** após executá-lo. O registro detalhado está em `docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md`.

Isso fecha:

- dívida histórica Phase 4 product-admin;
- authenticated `/admin` smoke da Phase 8;
- customer/private-order isolation;
- authenticated checkout initiation;
- admin MFA/session;
- Store Settings e conflito otimista;
- shipping safe non-spending state;
- notification admin/worker reachability;
- ausência observada de exposição de secrets/provider payloads;
- public health final.

Aceite formal: `docs/superpowers/phase-9/FINAL_ACCEPTANCE.md`.

## Phase 8 — estado final

A Phase 8 possui implementação, hosted migration, reconciliação e owner smoke validados.

- hosted migration: `20260915092352 dashboard_metrics_attention_center`;
- rollout candidate: `773504f0e68220c1bda0ec706c4e62f8d542e433`;
- CI #1631 / run `34960866441`: **PASS**;
- dashboard permanece read-only e server-side;
- snapshot financeiro/operacional foi reconciliado contra dados hospedados reais;
- authenticated `/admin` smoke: **PASS / OWNER-REPORTED 2026-09-15**.

Status: **PRODUCTION ACCEPTED**.

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

## Próxima ação

O desenvolvimento planejado Phases 0–9 está encerrado e aceito. Resta apenas a decisão de integração Git:

1. manter Production pinada no runtime SHA atual até decisão do owner;
2. integrar `feat/phase-9-hardening-final-rollout` em `main` somente após autorização explícita;
3. não apagar branches nem reescrever histórico sem autorização separada quando aplicável.

A branch **não está integrada em `main`** neste registro.
