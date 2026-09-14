# ProxyBembem — Current Status

**Updated:** 2026-09-14

Este arquivo é o checkpoint operacional curto. A visão consolidada do projeto, inclusive reconciliação de branches, arquitetura, histórico e backlog conhecido, está em `docs/PROJECT_MASTER_OVERVIEW.md` e deve ser lida primeiro.

## Baseline atual

- Branch canônica: `main`.
- Merge da Phase 6: `95ac936ca11dfd695734138e579eb97085714980`.
- CI da `main` após o merge: run `34880603149` / #1529 — **PASS**.
- Production runtime: KingHost Node.js **22.1.0**.
- Backend/Auth: Supabase hospedado separadamente.
- Aplicação atualmente comprovada em Production: `c8c2bb20f1c265729c4d4aee7fe65a91e2e1cc4c`.
- As duas correções finais da Phase 6 foram migrations/funções do Supabase e já estão hospedadas; não exigiram redeploy do app.
- Runbook canônico: `docs/deployment/kinghost.md`.

## Roadmap

- Phase 0 — Design + Planning: **COMPLETE**.
- Phase 1 — Data + Audit Foundation: **COMPLETE / APPLIED**.
- Phase 2 — Admin Orders + Fulfillment: **COMPLETE / ACCEPTED**.
- Phase 3 — Customer Account + Private Orders: **COMPLETE / PRODUCTION ACCEPTED**.
- Phase 4 — Catalog + Products Admin + Navigation: **IMPLEMENTATION COMPLETE / AUTOMATED GREEN**; o antigo smoke manual amplo da Stage 3 não foi integralmente refeito.
- Phase 5 — Melhor Envio + Labels + Tracking: **COMPLETE / OWNER ACCEPTED**.
- Phase 6 — Transactional Notifications: **COMPLETE / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN**.
- Phase 7 — Store Settings: **NOT STARTED**.
- Phase 8 — Dashboard Metrics + Attention Center: **NOT STARTED**.
- Phase 9 — Hardening + Final Rollout: **NOT STARTED**.

## Invariantes aceitos

- Supabase `public.products` é a única autoridade runtime de catálogo.
- Browser nunca decide preço, frete, total, ownership ou status financeiro.
- Iniciar pagamento exige cliente Supabase autenticado/verificado.
- Mercado Pago continua autoridade financeira.
- Pedidos do cliente são privados em `/minha-conta/pedidos/{uuid}`.
- Não restaurar guest checkout, `/pedido/[token]` ou guest claim.
- Admin exige owner UUID + senha + TOTP/AAL2 + sessão administrativa ativa.
- Produto usa somente `draft | published | archived`; sem hard delete.
- Compra de etiqueta Melhor Envio é sempre explícita e fail-closed; `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` é o default seguro fora de janela deliberada de compra.
- Compra, geração, impressão e postagem são operações distintas; gerar/imprimir não marca `shipped`.
- Migrations já hospedadas não são regravadas/reaplicadas.
- Falha de e-mail nunca altera pagamento, fulfillment ou shipping.
- Resend Production mantém Open Tracking OFF e Click Tracking OFF.

## Phase 5 — evidência resumida

- OAuth Production reautorizado com os nove scopes aceitos.
- Caminho controlado de preparação chegou ao carrinho do Melhor Envio sem gasto; fixture observou custo R$ 23,69.
- Task 18 (compra real) e Task 20 (smoke final) foram aceitas pelo proprietário em 2026-09-11.
- O antigo smoke amplo da Phase 4 não deve ser considerado retroativamente provado por esse uso de Production.

## Phase 6 — evidência resumida

Production acceptance concluída em 2026-09-14:

- cron KingHost usa `GET https://www.proxybembem.com.br/api/internal/notifications/process` a cada 5 minutos;
- domínio Resend verificado em `sa-east-1`, envio habilitado, Open/Click Tracking OFF;
- webhook assinado em `https://www.proxybembem.com.br/api/webhooks/resend` para `email.sent`, `email.delivered`, `email.bounced`, `email.failed`, `email.suppressed`;
- fixture `production_started` percorreu outbox -> worker -> Resend -> webhook e chegou a `delivered`;
- histórico protegido do admin exibiu a entrega;
- reenvio manual criou linha distinta/auditável e também chegou a `delivered`;
- cancelamento administrativo de pedido nunca pago foi corrigido para permanecer silencioso;
- webhook atrasado agora é ligado ao histórico sem rebaixar estado terminal;
- único known orphan histórico foi backfilled: contagem conhecida = 0;
- fila final sem rows vencidas ativas.

Migrations finais hospedadas:

- `20260914180352 transactional_notification_final_hardening`
- `20260914181035 transactional_notification_webhook_backfill`

Checkpoint final de implementação/backfill antes da consolidação: `caf1090cd3963d576d324e8ada6be70b83481027`, CI #1523 (`34878962739`) — PASS.

## Advisors / hardening ainda conhecidos

- RLS sem policy em tabelas backend-only é intencional quando browser CRUD está revogado.
- `customer_get_order` e `customer_list_orders` são RPCs `SECURITY DEFINER` autenticadas e owner-scoped por design.
- Supabase leaked-password protection segue desabilitado e deve ser avaliado no hardening.
- `customer_profiles` possui findings `auth_rls_initplan` de performance.
- índices marcados como unused são informativos no volume atual; não remover cegamente.
- observação manual do header no-store autenticado não foi registrada no último smoke, embora exista regressão automatizada.

## Incidente operacional registrado

Em 2026-09-14 um shell com `umask 077` fez assets de build nascerem `600`, causando `403` do nginx em CSS/JS. Foi corrigido restaurando `umask 022` e permissões legíveis em `/_next/static`. O deploy não foi alterado para contornar isso por decisão do proprietário; o runbook agora registra que build/deploy deve ocorrer com umask normal. `.env.production` continua privado.

## Próxima ação

1. Usar `docs/PROJECT_MASTER_OVERVIEW.md` como ponto de partida.
2. Concluir a limpeza das branches históricas já classificadas como superadas.
3. Criar qualquer trabalho novo a partir da `main` atual.
4. Próxima fase prevista: **Phase 7 — Store Settings**, salvo se o proprietário preferir executar primeiro uma rodada de revisão/hardening das pendências conhecidas.
