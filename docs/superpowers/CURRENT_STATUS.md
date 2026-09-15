# ProxyBembem — Current Status

**Updated:** 2026-09-15  
**Active branch:** `main`  
**Canonical integration branch:** `main`

Este arquivo é o checkpoint operacional curto. A visão consolidada do projeto está em `docs/PROJECT_MASTER_OVERVIEW.md`; a evidência final da Phase 7 está em `docs/superpowers/phase-7/FINAL_ACCEPTANCE.md`.

## Estado atual

- Phase 0 — Design + Planning: **COMPLETE**.
- Phase 1 — Data + Audit Foundation: **COMPLETE / APPLIED**.
- Phase 2 — Admin Orders + Fulfillment: **COMPLETE / ACCEPTED**.
- Phase 3 — Customer Account + Private Orders: **COMPLETE / PRODUCTION ACCEPTED**.
- Phase 4 — Catalog + Products Admin + Navigation: **IMPLEMENTATION COMPLETE / AUTOMATED GREEN**; o antigo smoke manual amplo da Stage 3 não foi integralmente refeito.
- Phase 5 — Melhor Envio + Labels + Tracking: **COMPLETE / OWNER ACCEPTED**.
- Phase 6 — Transactional Notifications: **COMPLETE / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN**.
- Phase 7 — Store Settings: **COMPLETE / HOSTED SUPABASE APPLIED + VALIDATED / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN**.
- Phase 8 — Dashboard Metrics + Attention Center: **NOT STARTED**.
- Phase 9 — Hardening + Final Rollout: **NOT STARTED**.

## Phase 7 — resultado final

Store Settings V1 contém exatamente cinco settings allowlisted:

- prazo de produção em dias úteis, 1–15, default 5;
- e-mail público opcional;
- WhatsApp público opcional em E.164;
- flag de aviso público;
- texto simples de aviso, máximo 400 caracteres.

A implementação inclui singleton `public.store_settings`, constraints/RLS, RPC atômica com audit e optimistic concurrency, domínio/repository/cache server-side, `/api/admin/settings`, `/admin/configuracoes` e projeção pública sanitizada. Nenhum provider secret virou Store Setting.

Os consumidores públicos da mesma informação agora usam a configuração global como fonte de verdade: FAQ, footer, `/contato`, banner, carrinho, suporte de pedido, `/privacidade`, `/trocas-e-reembolsos` e o prazo exibido nos detalhes de produto. O save do admin também força refresh do tree server-side para evitar manter props públicas antigas na mesma sessão.

### Supabase hospedado

- migration repo: `supabase/migrations/202609140003_store_settings.sql`;
- hosted version: `20260915002740`;
- hosted name: `store_settings`;
- singleton/RLS/grants/RPC/constraints verificados;
- rollback-only smoke validou update + avanço de revisão + stale conflict + audit allowlisted e foi revertido sem fixture persistida;
- advisors não mostraram nova exposição causada pela Phase 7.

### Integração, runtime e CI

Runtime final aceito em Production:

`3fd88688a6cfae343fea3b346a3d1cad1035eb86` — `fix: make store settings globally authoritative`.

A `main` foi avançada por fast-forward para esse mesmo SHA, sem force update. Antes da integração, a branch da Phase 7 estava 60 commits à frente e 0 atrás da `main`, com merge-base exatamente no antigo HEAD da `main`.

GitHub Actions CI #1613 / run `34923612641`: **PASS** no mesmo SHA. O pipeline concluiu com sucesso runtime Node 22.1.0, install congelado, typecheck, build KingHost, private-order route contract, startup smoke e suíte automatizada.

### KingHost / smoke final

- Production usa Node.js **22.1.0** e pnpm major **10**.
- O checkout KingHost estava em detached HEAD no antigo runtime `db430829...`.
- O remote foi ajustado para buscar `main`, criou-se branch local `main` rastreando `origin/main`, e o checkout ficou limpo no SHA `3fd88688...`.
- Build/deploy seguiu o runbook KingHost com `npx pnpm@10 install --frozen-lockfile` e `NODE_ENV=production npx pnpm@10 deploy:kinghost`.
- Restart foi feito pelo painel KingHost, sem `pm2 start` manual.
- `https://www.proxybembem.com.br/` respondeu **HTTP/2 200** após o restart.
- `next-env.d.ts` foi alterado automaticamente pelo build Next.js e restaurado depois; isso não altera o runtime já gerado.
- Smoke funcional do proprietário confirmou que mudanças de Configurações propagam para os consumidores públicos globais relevantes, incluindo contato e prazo.
- O stale two-tab save permanece recusando sobrescrita de revisão mais nova.

Detalhes e evidências: `docs/superpowers/phase-7/FINAL_ACCEPTANCE.md`.

## Phase 5 — evidência histórica preservada

Phase 5 está **complete / owner accepted** e permanece fechada no nível de handoff do proprietário.

- O caminho controlado Production **non-spending / sem gasto** chegou ao carrinho real do Melhor Envio com shipment local em `in_cart`; custo observado no fixture: **R$ 23,69**; sem provider purchased-order identity e sem transição falsa para `shipped`.
- `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` continua sendo o default seguro fora de uma janela deliberada de compra.
- Task 18 **owner accepted** em 2026-09-11 — aceitação **owner-reported** da primeira compra real, sem fabricar provider trace não observado.
- Task 19 **complete / concluída** — documentação operacional da Phase 5 reconciliada com a arquitetura e a evidência aceita.
- Task 20 **owner accepted** em 2026-09-11 — smoke final de Production **owner-reported** pelo proprietário.

Migrations Phase 5 registradas/aplicadas:

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
- Compra de etiqueta Melhor Envio é explícita e fail-closed; `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` permanece o default seguro fora de janela deliberada.
- Compra, geração, impressão e postagem são operações distintas; gerar/imprimir não marca `shipped`.
- Migrations já hospedadas não são regravadas/reaplicadas.
- Falha de e-mail nunca altera pagamento, fulfillment ou shipping.
- Resend Production mantém Open Tracking OFF e Click Tracking OFF.
- Store Settings não contém secrets de Mercado Pago, Melhor Envio, Supabase, Resend, cron ou KingHost.

## Riscos/backlog conhecidos

- Phase 4: antigo browser smoke amplo de produto CRUD/image/conflict/cache não foi integralmente refeito.
- Observação manual do header `no-store` autenticado não foi registrada no último smoke, embora exista regressão automatizada.
- Supabase leaked-password protection segue desabilitado e deve ser avaliado na Phase 9.
- `customer_profiles` ainda possui findings `auth_rls_initplan` de performance.
- Índices marcados como unused permanecem informativos no volume atual; não remover cegamente.
- RLS sem policy em tabelas backend-only é intencional quando browser CRUD está revogado.
- Não repetir build/deploy KingHost com `umask 077` ativo.

## Próxima ação

A Phase 7 está encerrada, integrada na `main` e aceita em Production. Não há trabalho pendente da Phase 7.

Phase 8 e Phase 9 permanecem **NOT STARTED** e não devem ser iniciadas automaticamente sem instrução explícita do proprietário.
