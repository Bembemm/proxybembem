# ProxyBembem — Phase 7 / Continuidade

**Branch de trabalho:** `feat/phase-7-store-settings`  
**Base inicial:** `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`  
**Criado em:** 2026-09-14  
**Estado:** implementação concluída até Task 7; Task 8 pre-rollout em andamento; Supabase hospedado e KingHost ainda não alterados pela Phase 7.

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
- Supabase hospedado, Mercado Pago, Melhor Envio e Resend continuam os providers atuais.

## Escopo V1 aprovado

Store Settings contém exatamente:

- `production_lead_time_business_days`: inteiro 1–15, default 5;
- `contact_email`: público e opcional;
- `contact_whatsapp_e164`: público, opcional e E.164;
- `notice_enabled`: booleano, default false;
- `notice_text`: texto simples opcional, máximo 400 caracteres.

Fora de escopo: pause store, preços globais, frete manual, controles financeiros, auto-compra de etiqueta, secrets/provider credentials e settings arbitrários.

## Arquitetura aprovada/implementada

### Banco

- migration repo: `supabase/migrations/202609140003_store_settings.sql`;
- singleton `public.store_settings`, `id='default'`;
- colunas tipadas e constraints equivalentes ao domínio;
- seed preserva contato público atual e mantém aviso desligado;
- RLS habilitado;
- anon/authenticated sem CRUD direto;
- service role com leitura e RPC de mutação;
- `admin_update_store_settings(...)` é `SECURITY DEFINER`, `search_path=''`, optimistic concurrency por `expectedUpdatedAt` e grava `admin_audit_log` na mesma transação;
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
- Esse run verificou Node 22.1.0, frozen install, typecheck, KingHost build, private-order route contract, startup smoke e **783/783 testes**.

### Task 8 — revisão pre-rollout

- branch diff desde a base revisado: alterações concentram-se em Store Settings, admin/storefront e testes/docs; nenhum arquivo de pagamento, shipping spend gate, Resend runtime, `.env.production` ou deploy asset permissions foi modificado.
- busca no diff por nomes de secrets (`MERCADO_PAGO_ACCESS_TOKEN`, `RESEND_API_KEY`, `MELHOR_ENVIO_CLIENT_SECRET`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`) encontrou apenas texto de teste/plano que exige ausência desses secrets na migration, não valores secretos.
- contato público antigo aparece legitimamente no seed, specs/plano/test fixtures e linhas removidas; um uso residual como placeholder do formulário admin foi trocado por exemplo genérico no commit `a123b16ea8e0d4e5026ea4bf057001f3d9ca457e`.
- `CURRENT_STATUS.md` atualizado no commit `d32828e3df970a831aea36ad910979f0488a1561` para refletir implementação e rollout pendente.
- CI do HEAD documental/final da Task 8 ainda precisa ser observado antes de DDL hospedado.

## Estado atual

### Concluído

- design, spec e plano aprovados;
- Tasks 1–7 implementadas;
- migration repo criada, mas ainda **não aplicada** no Supabase hospedado;
- domínio/repository/cache/admin route/admin UI completos;
- projeção pública, FAQ/footer/banner/contato/carrinho/suporte de pedido completos;
- revisão de escopo/segurança da Task 8 feita;
- documentação de checkpoint em atualização.

### Pendente

- finalizar atualização de `ADMIN_DASHBOARD_MASTER_PLAN.md`;
- observar CI verde no HEAD atual da branch para fechar Task 8;
- Task 9: re-checar migration history, aplicar `202609140003_store_settings.sql` uma única vez no Supabase hospedado, validar contrato/rollback-only conflict+audit e advisors;
- Task 10: deploy KingHost, restart via painel, smoke admin/público e reconciliação final dos docs;
- integração em `main` continua decisão explícita do proprietário.

## Próximo passo exato

1. Atualizar `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` com Phase 7 = implementação pronta / rollout pendente.
2. Esperar CI do HEAD final da Task 8 e exigir sucesso antes de tocar no Supabase hospedado.
3. Se verde, iniciar Task 9 pela **re-checagem da migration history hospedada**. Não aplicar DDL antes dessa leitura.

Não iniciar Phase 8 ou Phase 9 automaticamente.

## Registro resumido

### 2026-09-14 — abertura/design/plano

- branch criada a partir de `main @ 4d9f5a...`;
- escopo V1, segurança, singleton, cache/fallback e integrações aprovados;
- spec e plano TDD criados.

### 2026-09-14 — implementação Tasks 1–7

- schema/domain/repository/cache/admin route/admin UI/storefront/contact/support implementados em ciclos RED/GREEN;
- Task 7 fechou com CI #1582 e 783/783 testes.

### 2026-09-14 — Task 8 pre-rollout

- diff/security review executado;
- placeholder com número antigo real removido;
- status docs começaram a ser reconciliados;
- rollout hospedado ainda não iniciado.
