# ProxyBembem — Current Status

**Updated:** 2026-09-15  
**Active branch:** `feat/phase-8-dashboard-metrics-attention`  
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
- Phase 8 — Dashboard Metrics + Attention Center: **IMPLEMENTATION COMPLETE / AUTOMATED GREEN**; hosted migration ainda não aplicada e Production ainda não aceita.
- Phase 9 — Hardening + Final Rollout: **NOT STARTED**.

## Phase 8 — checkpoint de implementação

A Phase 8 transforma `/admin` em um dashboard operacional server-side sem introduzir autoridade financeira ou operacional no browser.

Implementado na branch `feat/phase-8-dashboard-metrics-attention`:

- migration aditiva `supabase/migrations/202609150001_dashboard_metrics_attention_center.sql`;
- RPC `public.admin_get_dashboard_snapshot()` read-only, `SECURITY DEFINER`, `search_path=''` e executável somente por `service_role`;
- um único `as_of` e períodos Today/Week/Month calculados em `America/Sao_Paulo`;
- aprovado bruto e reversões derivados de `order_events` confiáveis do Mercado Pago, com dedupe determinístico do primeiro evento por pedido;
- contagens atuais de fulfillment e risco financeiro sem inventar receita líquida;
- Attention Center read-only por pedido, priorizado por maior severidade, com top 5 e link para o fluxo existente de pedidos;
- ranking mensal de produtos a partir do snapshot imutável `orders.items` dos pedidos aprovados no mês;
- repository TypeScript server-only, `cache: "no-store"`, parser estrito e falha visível sem substituir erro por zeros;
- componentes server-side de métricas, operação, atenção e produtos;
- `/admin` protegido continua exigindo `requireAdminPageAccess({ touch: true })` e preserva o atalho do Melhor Envio.

A implementação não adiciona provider call, compra de etiqueta, cancelamento, mutation de pedido, envio de notificação ou mutation de Store Settings.

### Automated evidence

Checkpoint automatizado atual:

`2023595cc845aca3fc482db484cea18332c36b5f` — `test: harden dashboard metric semantics`.

GitHub Actions CI #1626 / run `34951178021`: **PASS**.

O pipeline passou runtime Node **22.1.0**, install congelado, typecheck, `build:kinghost`, private-order route contract, startup smoke e suíte completa. Os testes novos cobrem contrato SQL, parser/repository, UI protegida e semântica de tempo/finance/attention.

### Ainda NÃO concluído na Phase 8

- a migration `dashboard_metrics_attention_center` ainda não foi aplicada ao Supabase hospedado neste checkpoint;
- o snapshot hospedado ainda não foi reconciliado contra as linhas autoritativas reais;
- a função/grants ainda não passaram o check pós-migration hospedado desta fase;
- o candidate ainda não foi deployado/aceito na KingHost;
- não existe `FINAL_ACCEPTANCE.md` da Phase 8 ainda;
- a branch não foi integrada em `main`.

## Phase 7 — resultado final preservado

Store Settings V1 contém exatamente cinco settings allowlisted:

- prazo de produção em dias úteis, 1–15, default 5;
- e-mail público opcional;
- WhatsApp público opcional em E.164;
- flag de aviso público;
- texto simples de aviso, máximo 400 caracteres.

A implementação inclui singleton `public.store_settings`, constraints/RLS, RPC atômica com audit e optimistic concurrency, domínio/repository/cache server-side, `/api/admin/settings`, `/admin/configuracoes` e projeção pública sanitizada. Nenhum provider secret virou Store Setting.

Os consumidores públicos da mesma informação usam a configuração global como fonte de verdade: FAQ, footer, `/contato`, banner, carrinho, suporte de pedido, `/privacidade`, `/trocas-e-reembolsos` e o prazo exibido nos detalhes de produto. O save do admin força refresh do tree server-side para evitar props públicas antigas na mesma sessão.

### Supabase hospedado Phase 7

- migration repo: `supabase/migrations/202609140003_store_settings.sql`;
- hosted version: `20260915002740`;
- hosted name: `store_settings`;
- singleton/RLS/grants/RPC/constraints verificados;
- rollback-only smoke validou update + avanço de revisão + stale conflict + audit allowlisted e foi revertido sem fixture persistida;
- advisors não mostraram nova exposição causada pela Phase 7.

### Runtime Phase 7 aceito

`3fd88688a6cfae343fea3b346a3d1cad1035eb86` — `fix: make store settings globally authoritative`.

GitHub Actions CI #1613 / run `34923612641`: **PASS** no mesmo SHA. O pipeline concluiu com sucesso runtime Node 22.1.0, install congelado, typecheck, build KingHost, private-order route contract, startup smoke e suíte automatizada.

A Phase 7 foi integrada na `main` por fast-forward. A documentação de fechamento posterior está no commit `75c78437883627e241a9708c8d07a0988dc8c8b5`.

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
- Phase 8 é read-only: dashboard/attention não resolve flags nem muta verdade financeira/operacional.

## Riscos/backlog conhecidos

- Phase 4: antigo browser smoke amplo de produto CRUD/image/conflict/cache não foi integralmente refeito.
- Observação manual do header `no-store` autenticado não foi registrada no último smoke, embora exista regressão automatizada.
- Supabase leaked-password protection segue desabilitado e deve ser avaliado na Phase 9.
- `customer_profiles` ainda possui findings `auth_rls_initplan` de performance.
- Índices marcados como unused permanecem informativos no volume atual; não remover cegamente.
- RLS sem policy em tabelas backend-only é intencional quando browser CRUD está revogado.
- Não repetir build/deploy KingHost com `umask 077` ativo.

## Próxima ação

Phase 8 está **implementation complete / automated green** no candidate `2023595cc845aca3fc482db484cea18332c36b5f`.

Próximo passo: registrar este checkpoint documental, validar o novo exact-SHA CI e então aplicar **uma única vez** a migration Phase 8 no Supabase hospedado, reconciliar o snapshot real e checar grants/advisors antes do rollout KingHost.

Phase 9 continua **NOT STARTED** e não deve ser iniciada automaticamente.
