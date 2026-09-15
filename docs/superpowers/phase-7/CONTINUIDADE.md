# ProxyBembem — Phase 7 / Continuidade

**Branch de trabalho:** `feat/phase-7-store-settings`  
**Base inicial:** `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`  
**Criado em:** 2026-09-14  
**Estado:** implementação + Task 8 concluídas; Task 9 Supabase hospedado aplicada/validada; Task 10 deploy/smoke KingHost pendente.

Este arquivo é o **handoff vivo obrigatório** desta branch. Ele deve permitir que qualquer chat novo continue sem depender da memória da conversa.

## REGRA PARA TODO CHAT NOVO

Antes de propor, alterar ou implementar qualquer coisa nesta branch:

1. Ler este arquivo inteiro.
2. Ler `docs/PROJECT_MASTER_OVERVIEW.md`.
3. Ler `docs/superpowers/CURRENT_STATUS.md`.
4. Ler `docs/superpowers/specs/2026-09-14-store-settings-design.md`.
5. Ler `docs/superpowers/plans/2026-09-14-store-settings-implementation.md`.
6. Confirmar que o trabalho está em `feat/phase-7-store-settings`, salvo instrução explícita do proprietário.
7. Não reabrir Phases 0–6 sem regressão concreta ou pedido explícito.
8. Não sobrescrever migrations já aplicadas; qualquer correção de banco nova é aditiva.
9. Seguir o plano e seus gates de verificação.
10. Antes de encerrar trabalho relevante, atualizar este arquivo com estado, evidência e próximo passo exato.

Em caso de conflito: implementação/estado hospedado atual -> spec Phase 7 -> plano Phase 7 -> `PROJECT_MASTER_OVERVIEW.md` -> `CURRENT_STATUS.md` -> este handoff para andamento operacional.

## Baseline herdado

- Phases 0–6 integradas na `main`.
- Phase 6 completa e Production accepted; merge `95ac936ca11dfd695734138e579eb97085714980`.
- Base inicial da branch: `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`.
- Main CI antes da branch: #1534 / `34882211417` — PASS.
- Production app comprovada antes da Phase 7: KingHost runtime `c8c2bb20f1c265729c4d4aee7fe65a91e2e1cc4c`, Node.js 22.1.0.
- Supabase hospedado `ProxyBembem` / project id `kicgoocozxzkuoqajqif`, região `sa-east-1`.
- Mercado Pago, Melhor Envio e Resend continuam os providers atuais.

## Escopo V1 aprovado

Store Settings contém exatamente:

- `production_lead_time_business_days`: inteiro 1–15, default 5;
- `contact_email`: público e opcional;
- `contact_whatsapp_e164`: público, opcional e E.164;
- `notice_enabled`: booleano, default false;
- `notice_text`: texto simples opcional, máximo 400 caracteres.

Fora de escopo: pause store, preços globais, frete manual, controles financeiros, auto-compra de etiqueta, secrets/provider credentials e settings arbitrários.

## Arquitetura implementada

### Banco

- migration repo: `supabase/migrations/202609140003_store_settings.sql`;
- migration hospedada real: `20260915002740 store_settings`;
- singleton `public.store_settings`, `id='default'`;
- colunas tipadas e constraints equivalentes ao domínio;
- seed preserva contato público atual e mantém aviso desligado;
- RLS habilitado;
- anon/authenticated sem CRUD direto;
- service role com leitura direta e RPC de mutação, sem UPDATE direto;
- `admin_update_store_settings(...)` é `SECURITY DEFINER`, owner `postgres`, `search_path=''`, optimistic concurrency por `expectedUpdatedAt` e grava `admin_audit_log` na mesma transação;
- anon/authenticated não executam a RPC; service_role executa;
- audit contém apenas actor + valores allowlisted anteriores/novos.

### Backend/admin

- domínio: `lib/store-settings/store-settings.ts`;
- repository: `lib/server/store-settings.ts`;
- cache público: `lib/server/store-settings-cache.ts`, TTL 5 minutos/tag invalidável;
- admin action: `lib/server/admin-store-settings-actions.ts`;
- API: `/api/admin/settings`, PATCH same-origin, body bounded, owner/AAL2/admin-session boundary existente, `private, no-store`;
- UI: `/admin/configuracoes` + item `Configurações` no sidebar;
- save explícito, sem autosave;
- 400 com erros por campo; 409 estável para revisão velha; save bem-sucedido avança a revisão local.

### Projeção pública

- root layout carrega `getPublicStoreSettings()` server-side;
- browser recebe apenas `PublicStoreSettings`;
- fallback de indisponibilidade: prazo 5, aviso off, contatos ausentes;
- FAQ usa prazo dinâmico;
- footer e `/contato` só renderizam canais presentes;
- banner usa JSX/texto simples e só aparece quando `noticeEnabled && noticeText`;
- storefront settings não renderizam em `/admin`;
- carrinho recebe WhatsApp configurado e omite fallback quando ausente;
- helper `buildWhatsAppOrderUrl(destinationE164, message)` retorna null para destino ausente/inválido;
- suporte do pedido privado consulta settings somente depois do gate de autenticação e resolução owner-scoped do pedido.

## Invariantes preservados

- Browser não vira autoridade de preço, frete, total, ownership, pagamento ou fulfillment.
- Mercado Pago continua autoridade financeira.
- Melhor Envio continua sem auto-spend e com `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` como default seguro fora de janela deliberada.
- Preparar/comprar/gerar/imprimir/postar seguem operações distintas.
- Pedidos continuam privados e owner-scoped.
- Admin continua owner UUID + senha + TOTP/AAL2 + sessão administrativa.
- Falha de e-mail não altera payment/fulfillment/shipping.
- Resend tracking continua OFF.
- Nenhum secret/provider credential foi transformado em Store Setting.
- Nenhuma mudança de deploy/permissões/`umask` faz parte da Phase 7.

## Evidência automatizada observada

### Task 6

- CI #1572 passou após integração do root shell/FAQ/footer/banner.

### Task 7

- RED confirmado pela assinatura antiga do helper WhatsApp (`TS2554`).
- GREEN final de código no SHA `344c1aeb5ca9d4d118ed6d72dfec8a4538f335c6`.
- CI #1582 / run `34909496593`: PASS.
- Verificou Node 22.1.0, frozen install, typecheck, KingHost build, private-order route contract, startup smoke e **783/783 testes**.

### Task 8 — pre-rollout fechado

- branch diff desde a base revisado: alterações concentram-se em Store Settings, admin/storefront e testes/docs; nenhum arquivo de payment authority, shipping spend gate, Resend runtime, `.env.production` ou deploy asset permissions foi modificado.
- busca por nomes de secrets encontrou apenas testes/plano que exigem ausência, não valores secretos.
- placeholder residual com número antigo real foi trocado por exemplo E.164 genérico no commit `a123b16ea8e0d4e5026ea4bf057001f3d9ca457e`.
- docs reconciliados no checkpoint; Master Plan também deixou de carregar metadado stale da branch Phase 6.
- HEAD final do checkpoint: `1b0ca0dbb438a8bc582101c8a22ab28e09124ce0`.
- CI #1586 / run `34913005979`: **PASS**.
- Resultado fresco: exact Node 22.1.0, frozen install, typecheck, KingHost build, private-order route contract, startup smoke e **783/783 testes**, 0 fail/skipped/todo.

## Task 9 — Supabase hospedado

### Gate de migration history

Antes da aplicação, o histórico hospedado terminava em:

- `20260914180352 transactional_notification_final_hardening`;
- `20260914181035 transactional_notification_webhook_backfill`.

Não havia `store_settings`/Phase 7 hospedada.

### Aplicação

Migration aplicada uma única vez por ação de migration do Supabase:

- hosted version: `20260915002740`;
- hosted name: `store_settings`.

A migration repo original continua `supabase/migrations/202609140003_store_settings.sql`; não reescrever/aplicar novamente.

### Contrato hospedado verificado

- exatamente 1 row em `public.store_settings`, exatamente 1 `id='default'`;
- seed final após validação: lead 5, contato público preservado, notice false, notice_text null;
- RLS true;
- anon: SELECT/INSERT/UPDATE/DELETE false;
- authenticated: SELECT/INSERT/UPDATE/DELETE false;
- service_role: SELECT true, UPDATE direto false;
- RPC `admin_update_store_settings` encontrada uma vez, owner postgres, `SECURITY DEFINER`, `search_path=""`;
- anon/authenticated execute false; service_role execute true;
- colunas exatas: `id`, `production_lead_time_business_days`, `contact_email`, `contact_whatsapp_e164`, `notice_enabled`, `notice_text`, `updated_at`;
- verificação de nomes de coluna secret/token/credential/password/key: nenhum match.

### Rollback-only concurrency/audit smoke

Foi executado um bloco hospedado de validação em subtransação com rollback automático:

1. capturou a row `default` e um actor admin já existente sem expor o UUID;
2. chamou a RPC com revisão atual e mudança temporária de lead time;
3. exigiu outcome `updated`, novo `updated_at` e state temporário esperado;
4. chamou novamente com a revisão antiga e exigiu outcome `conflict`;
5. exigiu exatamente +1 audit row temporária;
6. comparou `previous_values` e `new_values` exatamente contra os cinco campos allowlisted e metadata `{}`;
7. lançou rollback esperado dentro da subtransação;
8. depois do rollback confirmou settings idênticos ao baseline e audit count idêntico ao baseline.

Leitura independente pós-rollback confirmou seed original e `store_settings_audit_count = 0`, portanto nenhuma alteração sintética ficou persistida.

### Advisors pós-DDL

Security:

- `store_settings` aparece apenas em `rls_enabled_no_policy` INFO; isso é intencional para tabela backend-only com browser CRUD revogado;
- WARNs restantes são preexistentes/conhecidos: `customer_get_order` + `customer_list_orders` SECURITY DEFINER autenticadas e owner-scoped; leaked-password protection desabilitado;
- nenhuma nova exposição da RPC Store Settings ou unsafe search_path.

Performance:

- 3 findings `auth_rls_initplan` continuam somente em `customer_profiles`;
- 6 `unused_index` INFO preexistentes;
- nenhuma finding nova de FK/index causada pela Phase 7.

## Estado atual

### Concluído

- design/spec/plano aprovados;
- Tasks 1–7 implementadas;
- Task 8 pre-rollout fechada com CI #1586 verde;
- migration Phase 7 aplicada uma única vez no Supabase hospedado;
- contrato, grants, RPC, rollback-only conflict/audit e advisors verificados;
- Task 9 concluída no nível de banco hospedado.

### Pendente

- esperar CI do HEAD documental pós-Task 9;
- Task 10: confirmar candidate SHA verde, deployar app KingHost, restart via painel e smoke focado admin/público;
- somente após smoke final atualizar `PROJECT_MASTER_OVERVIEW.md`, `CURRENT_STATUS.md`, Master Plan e este handoff para `COMPLETE / PRODUCTION ACCEPTED`;
- integração em `main` continua decisão explícita do proprietário.

## Próximo passo exato

1. Exigir CI verde no HEAD atual após estes docs.
2. Com CI verde, iniciar Task 10: confirmar exact candidate SHA.
3. Guiar deploy KingHost pelo runbook existente **uma ação/comando por vez**; não alterar `umask`/publisher/deploy script.
4. Restart via painel KingHost.
5. Fazer smoke de `/admin/configuracoes`, conflito/revisão, FAQ/contatos/banner/cart/order support e regressões storefront.

Não iniciar Phase 8 ou Phase 9 automaticamente.

## Registro resumido

### 2026-09-14 — abertura/design/plano

- branch criada a partir de `main @ 4d9f5a...`;
- escopo V1, segurança, singleton, cache/fallback e integrações aprovados;
- spec e plano TDD criados.

### 2026-09-14 — implementação Tasks 1–7

- schema/domain/repository/cache/admin route/admin UI/storefront/contact/support implementados em ciclos RED/GREEN;
- Task 7 fechou com CI #1582 e 783/783 testes.

### 2026-09-14 — Task 8

- diff/security review executado;
- placeholder real residual removido;
- docs reconciliados;
- CI #1586 verde no HEAD `1b0ca0d`, 783/783 testes.

### 2026-09-14 — Task 9

- migration history hospedado rechecado;
- `20260915002740 store_settings` aplicada uma única vez;
- singleton/RLS/grants/RPC/seed verificados;
- rollback-only update + stale conflict + atomic audit validado sem persistir fixture;
- advisors pós-DDL classificados sem regressão Phase 7;
- próximo passo: CI documental e Task 10 KingHost.
