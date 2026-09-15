# ProxyBembem — Current Status

**Updated:** 2026-09-14

Este arquivo é o checkpoint operacional curto. A visão consolidada do projeto, inclusive reconciliação de branches, arquitetura, histórico e backlog conhecido, está em `docs/PROJECT_MASTER_OVERVIEW.md` e deve ser lida primeiro.

## Trabalho ativo nesta branch

- Branch: `feat/phase-7-store-settings`.
- Base inicial: `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`.
- Handoff obrigatório da branch: `docs/superpowers/phase-7/CONTINUIDADE.md`.
- Qualquer chat novo trabalhando nesta branch deve ler `CONTINUIDADE.md` inteiro antes de continuar.
- Phase 7 — Store Settings teve design/spec aprovados e implementação concluída até as integrações públicas/contato da Task 7.
- Task 8 está no checkpoint pre-rollout: revisão de escopo/segurança + documentação + CI antes de qualquer DDL hospedado.
- Nenhuma migration Phase 7 foi aplicada ainda no Supabase hospedado e nenhum deploy Phase 7 foi feito na KingHost.
- Ao terminar uma sessão com trabalho relevante nesta branch, atualizar `CONTINUIDADE.md` com estado e próximo passo exato.

## Baseline atual

- Branch canônica: `main`.
- Merge da Phase 6: `95ac936ca11dfd695734138e579eb97085714980`.
- CI final da `main` antes da abertura da Phase 7: #1534 / run `34882211417` — **PASS**.
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
- Phase 7 — Store Settings: **IMPLEMENTATION COMPLETE THROUGH TASK 7 / PRE-ROLLOUT CHECKPOINT IN PROGRESS / HOSTED ROLLOUT PENDING**.
- Phase 8 — Dashboard Metrics + Attention Center: **NOT STARTED**.
- Phase 9 — Hardening + Final Rollout: **NOT STARTED**.

## Phase 7 — implementação atual

V1 implementa exatamente cinco settings tipados/allowlisted:

- prazo de produção em dias úteis, 1–15, default 5;
- e-mail público opcional;
- WhatsApp público opcional em E.164;
- flag de aviso público;
- texto simples de aviso, máximo 400 caracteres.

Implementação presente na branch:

- migration aditiva `supabase/migrations/202609140003_store_settings.sql` com singleton `id='default'`, constraints, RLS e RPC atômica de update + `admin_audit_log`;
- domínio/validação TypeScript, repository admin/public, fallback público seguro e cache server-side de 5 minutos com invalidação após save;
- rota administrativa protegida `/api/admin/settings` e página `/admin/configuracoes` no shell AAL2 existente;
- optimistic concurrency por `expectedUpdatedAt`, conflito 409 sem overwrite;
- FAQ, footer, banner, página de contato, fallback do carrinho e suporte do pedido consumindo apenas a projeção pública sanitizada;
- ausência de e-mail/WhatsApp não gera links quebrados;
- número público antigo removido dos fluxos ativos e helper de WhatsApp exige destino E.164 configurado;
- nenhum secret/provider credential virou Store Setting.

Último checkpoint automatizado de código antes do ajuste cosmético do placeholder/admin e desta documentação: branch SHA `344c1aeb5ca9d4d118ed6d72dfec8a4538f335c6`, CI #1582 / run `34909496593` — **PASS**, incluindo Node 22.1.0, frozen install, typecheck, KingHost build, private-order route contract, startup smoke e **783/783 testes**. O HEAD atual deve receber novo CI antes de qualquer rollout hospedado.

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
- Store Settings não contém secrets de Mercado Pago, Melhor Envio, Supabase, Resend, cron ou KingHost.

## Phase 5 — evidência resumida

Phase 5 está **complete / accepted** no nível de handoff do proprietário.

- OAuth Production foi reautorizado com os nove scopes aceitos.
- O caminho controlado non-spending/sem gasto chegou ao carrinho real do Melhor Envio com shipment local em `in_cart`; custo observado no fixture: **R$ 23,69**; sem provider purchased-order identity e sem transição falsa para shipped.
- `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` continua sendo o default seguro fora de uma janela deliberada de compra.
- Task 18 owner accepted em 2026-09-11 — aceitação owner-reported/informada pelo proprietário para a primeira compra real.
- Task 19 complete/concluída — documentação operacional da Phase 5 reconciliada com a arquitetura e a evidência aceita.
- Task 20 owner accepted em 2026-09-11 — smoke final de Production informado pelo proprietário.
- O antigo smoke amplo da Phase 4 não deve ser considerado retroativamente provado por esse uso de Production.

Migrations Phase 5 registradas/aplicadas:

- `202609080002_melhor_envio_oauth_scope_grants.sql`
- `202609080003_shipments_foundation.sql`
- `202609080004_shipment_operations.sql`
- `202609080005_shipment_cancel_reconciliation.sql`
- `202609080006_customer_shipment_projection.sql`
- `20260909194848_shipments_sender_profile_fk_index.sql`

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

1. Finalizar Task 8 com CI verde no HEAD atual da branch.
2. Somente após esse gate, executar Task 9: re-checar migration history no Supabase hospedado e aplicar uma única vez `202609140003_store_settings.sql`.
3. Validar contrato hospedado, optimistic conflict/audit e advisors antes de qualquer deploy KingHost.
4. Não marcar Phase 7 como Production accepted antes da Task 10 e não iniciar Phase 8 ou Phase 9 automaticamente.
