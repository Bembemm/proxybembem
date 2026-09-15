# ProxyBembem — Current Status

**Updated:** 2026-09-14

Este arquivo é o checkpoint operacional curto. A visão consolidada do projeto, inclusive reconciliação de branches, arquitetura, histórico e backlog conhecido, está em `docs/PROJECT_MASTER_OVERVIEW.md` e deve ser lida primeiro.

## Trabalho ativo nesta branch

- Branch: `feat/phase-7-store-settings`.
- Base inicial: `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`.
- Handoff obrigatório: `docs/superpowers/phase-7/CONTINUIDADE.md`.
- Phase 7 — Store Settings: implementação e Task 8 automatizada concluídas; migration hospedada aplicada e validada na Task 9; deploy/smoke KingHost da Task 10 ainda pendentes.
- Ao terminar trabalho relevante nesta branch, atualizar `CONTINUIDADE.md`.

## Baseline atual

- Branch canônica: `main`.
- Merge da Phase 6: `95ac936ca11dfd695734138e579eb97085714980`.
- CI final da `main` antes da abertura da Phase 7: #1534 / run `34882211417` — **PASS**.
- Production runtime atual antes do deploy Phase 7: KingHost Node.js **22.1.0**, app comprovada em `c8c2bb20f1c265729c4d4aee7fe65a91e2e1cc4c`.
- Backend/Auth: Supabase hospedado separadamente.
- Runbook canônico: `docs/deployment/kinghost.md`.

## Roadmap

- Phase 0 — Design + Planning: **COMPLETE**.
- Phase 1 — Data + Audit Foundation: **COMPLETE / APPLIED**.
- Phase 2 — Admin Orders + Fulfillment: **COMPLETE / ACCEPTED**.
- Phase 3 — Customer Account + Private Orders: **COMPLETE / PRODUCTION ACCEPTED**.
- Phase 4 — Catalog + Products Admin + Navigation: **IMPLEMENTATION COMPLETE / AUTOMATED GREEN**; o antigo smoke manual amplo da Stage 3 não foi integralmente refeito.
- Phase 5 — Melhor Envio + Labels + Tracking: **COMPLETE / OWNER ACCEPTED**.
- Phase 6 — Transactional Notifications: **COMPLETE / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN**.
- Phase 7 — Store Settings: **IMPLEMENTATION COMPLETE / HOSTED SUPABASE APPLIED + VALIDATED / KINGHOST DEPLOY + PRODUCTION SMOKE PENDING**.
- Phase 8 — Dashboard Metrics + Attention Center: **NOT STARTED**.
- Phase 9 — Hardening + Final Rollout: **NOT STARTED**.

## Phase 7 — implementação e rollout hospedado

V1 contém exatamente cinco settings tipados/allowlisted:

- prazo de produção em dias úteis, 1–15, default 5;
- e-mail público opcional;
- WhatsApp público opcional em E.164;
- flag de aviso público;
- texto simples de aviso, máximo 400 caracteres.

Implementação na branch:

- migration repo `supabase/migrations/202609140003_store_settings.sql`;
- singleton `public.store_settings`, constraints, RLS e RPC atômica de update + audit;
- domínio/validação TypeScript, repository admin/public, fallback seguro e cache server-side de 5 minutos;
- `/api/admin/settings` protegido pelo boundary admin existente;
- `/admin/configuracoes` com save explícito, 400 por campo e optimistic conflict 409;
- FAQ, footer, banner, `/contato`, fallback do carrinho e suporte do pedido recebem somente projeção pública sanitizada;
- ausência de e-mail/WhatsApp não gera links quebrados;
- nenhum provider secret virou Store Setting.

### Task 8 — gate pre-rollout

Final HEAD do checkpoint pre-rollout: `1b0ca0dbb438a8bc582101c8a22ab28e09124ce0`.

GitHub Actions CI #1586 / run `34913005979`: **PASS**:

- exact Node 22.1.0;
- frozen pnpm install;
- typecheck;
- KingHost build;
- private-order route contract;
- startup smoke;
- **783/783 testes PASS**, 0 fail/skipped/todo.

Diff/security review não encontrou alteração em payment authority, shipping spend gates, notification truth, `.env.production`, deploy asset permissions ou `umask`. O único número público antigo residual em UI era placeholder e foi trocado por exemplo E.164 genérico antes desse CI.

### Task 9 — Hosted Supabase

Migration aplicada uma única vez no projeto hospedado `ProxyBembem`:

- versão hospedada real: `20260915002740`;
- nome: `store_settings`.

Verificação hospedada:

- exatamente 1 linha `store_settings`, `id='default'`;
- seed preservado: prazo 5, contato público atual, aviso `false`, texto null;
- RLS habilitado;
- `anon` e `authenticated`: nenhum SELECT/INSERT/UPDATE/DELETE direto;
- `service_role`: SELECT direto permitido, UPDATE direto não permitido;
- `admin_update_store_settings`: owner `postgres`, `SECURITY DEFINER`, `search_path=''`;
- `anon`/`authenticated`: sem EXECUTE; `service_role`: EXECUTE permitido;
- colunas são somente `id`, prazo, contatos, aviso e `updated_at`; nenhuma coluna com nome de secret/token/credential/key/password;
- teste hospedado em subtransação rollback-only provou update válido + revisão avançada + exatamente 1 audit allowlisted, depois conflito com revisão velha; o bloco foi revertido e settings/audit permaneceram intactos;
- leitura pós-rollback confirmou seed original e zero audit sintético persistido.

Advisors após DDL:

- novo finding Phase 7 apenas INFO `rls_enabled_no_policy` em `store_settings`, intencional para tabela backend-only sem browser CRUD;
- WARNs de segurança continuam os conhecidos: duas RPCs customer `SECURITY DEFINER` owner-scoped e leaked-password protection desabilitado;
- performance continua com os 3 `customer_profiles auth_rls_initplan` conhecidos e índices unused informativos;
- nenhuma nova exposição de grant, unsafe definer/search-path ou missing FK/index causada pela Phase 7.

## Invariantes aceitos

- Supabase `public.products` é a única autoridade runtime de catálogo.
- Browser nunca decide preço, frete, total, ownership ou status financeiro.
- Iniciar pagamento exige cliente Supabase autenticado/verificado.
- Mercado Pago continua autoridade financeira.
- Pedidos do cliente são privados em `/minha-conta/pedidos/{uuid}`.
- Não restaurar guest checkout, `/pedido/[token]` ou guest claim.
- Admin exige owner UUID + senha + TOTP/AAL2 + sessão administrativa ativa.
- Produto usa somente `draft | published | archived`; sem hard delete.
- Compra de etiqueta Melhor Envio é sempre explícita e fail-closed; `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` é o default seguro fora de janela deliberada.
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

Em 2026-09-14 um shell com `umask 077` fez assets de build nascerem `600`, causando `403` do nginx em CSS/JS. Foi corrigido restaurando `umask 022` e permissões legíveis em `/_next/static`. O deploy não foi alterado para contornar isso por decisão do proprietário; o runbook registra que build/deploy deve ocorrer com umask normal. `.env.production` continua privado.

## Próxima ação

1. Esperar CI verde no HEAD documental pós-Task 9.
2. Iniciar Task 10 somente com esse HEAD verde: confirmar candidate SHA e deployar pela rotina KingHost existente, sem alterar permissões/`umask`.
3. Fazer restart pelo painel e smoke focado de `/admin/configuracoes` + storefront/contatos/cart/order support.
4. Só depois reconciliar docs finais e marcar Phase 7 `COMPLETE / PRODUCTION ACCEPTED`.
5. Integração em `main` continua decisão explícita do proprietário; não iniciar Phase 8 ou Phase 9 automaticamente.
