# ProxyBembem — Phase 7 / Continuidade

**Branch de trabalho:** `feat/phase-7-store-settings`  
**Base inicial:** `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`  
**Criado em:** 2026-09-14  
**Estado final:** **COMPLETE / HOSTED SUPABASE APPLIED + VALIDATED / PRODUCTION ACCEPTED**

Este arquivo é o handoff final da Phase 7. Para a evidência completa de aceitação, ler `docs/superpowers/phase-7/FINAL_ACCEPTANCE.md`.

## Regra para qualquer continuação

1. Ler `docs/PROJECT_MASTER_OVERVIEW.md`.
2. Ler `docs/superpowers/CURRENT_STATUS.md`.
3. Ler este arquivo e `docs/superpowers/phase-7/FINAL_ACCEPTANCE.md`.
4. Não reabrir Phases 0–7 sem regressão concreta ou pedido explícito.
5. Não reescrever/reaplicar migrations hospedadas; correções futuras são aditivas.
6. Não fazer merge, squash, rebase, branch deletion ou force-move sem aprovação explícita do proprietário.
7. Não iniciar Phase 8 ou 9 automaticamente.

## Escopo V1 entregue

Store Settings contém somente:

- `production_lead_time_business_days`: 1–15, default 5;
- `contact_email`: público/opcional;
- `contact_whatsapp_e164`: público/opcional/E.164;
- `notice_enabled`: booleano;
- `notice_text`: texto simples opcional, máximo 400 caracteres.

Fora de escopo e ainda fora de Store Settings: pause store, preços globais, frete manual, controles financeiros, auto-compra de etiqueta, provider secrets/credentials e settings arbitrários.

## Arquitetura final

### Banco

- migration repo: `supabase/migrations/202609140003_store_settings.sql`;
- hosted migration: `20260915002740 store_settings`;
- singleton `public.store_settings`, `id='default'`;
- constraints equivalentes ao domínio;
- RLS habilitado;
- anon/authenticated sem CRUD direto;
- service role com leitura e RPC allowlisted, sem UPDATE direto;
- `admin_update_store_settings(...)`: owner `postgres`, `SECURITY DEFINER`, `search_path=''`, optimistic concurrency por `expectedUpdatedAt` e audit allowlisted atômico.

### Backend/admin

- domínio: `lib/store-settings/store-settings.ts`;
- repository: `lib/server/store-settings.ts`;
- cache público: `lib/server/store-settings-cache.ts`, TTL/tag server-side;
- admin action: `lib/server/admin-store-settings-actions.ts`;
- API: `/api/admin/settings`, PATCH same-origin e boundary admin existente;
- UI: `/admin/configuracoes`, save explícito, validação por campo, conflito 409 estável e sem autosave.

### Projeção pública

- root shell recebe somente `PublicStoreSettings` sanitizado;
- fallback seguro: prazo 5, aviso off e contatos ausentes quando a leitura pública falha;
- FAQ usa prazo configurado;
- footer e `/contato` omitem canais ausentes;
- banner usa texto simples e aparece somente quando `noticeEnabled && noticeText`;
- carrinho recebe WhatsApp configurado e não inventa destino quando ausente;
- suporte do pedido privado resolve ownership antes de usar settings;
- nenhuma credencial de infraestrutura é projetada ao browser.

## Evidência de implementação/CI

Checkpoint pre-rollout final antes do deploy passou os gates automatizados da branch. Após o bug visual do aviso ser identificado, foi criado o commit:

`db4308296e9f2603e76ded4332394dd58c99a84c` — `fix: position store notice below fixed navbar`.

CI #1589 / run `34918063220`: **PASS** no mesmo SHA.

O fix mantém o `StoreNotice` abaixo da navbar fixa por contrato responsivo:

- navbar: `h-14 sm:h-16`;
- notice: `relative top-14 sm:top-16`;
- regressão automatizada cobre a relação.

## Hosted Supabase — concluído

A migration foi aplicada uma única vez. Verificações hospedadas confirmaram singleton, grants, RLS, constraints, RPC e ausência de campos secretos.

O teste rollback-only da RPC comprovou:

1. update válido com revisão atual;
2. avanço de `updated_at`;
3. exatamente um audit temporário allowlisted;
4. tentativa com revisão velha retornando conflito;
5. rollback final sem settings/audit sintético persistido.

Não reaplicar `20260915002740 store_settings`.

## Task 10 — KingHost / Production — concluída

Candidate implantado: `db4308296e9f2603e76ded4332394dd58c99a84c`.

O checkout Production estava detached no SHA anterior e foi avançado explicitamente por fetch + checkout do candidate. `nvm use` confirmou Node.js 22.1.0; install/deploy seguiram o runbook KingHost; restart ocorreu pelo painel, sem iniciar PM2 manualmente.

Smoke final observado:

- homepage: `HTTP/2 200`;
- aviso temporário presente no HTML quando habilitado;
- após o fix, evidência visual do proprietário mostrou o banner totalmente visível logo abaixo da navbar;
- stale-tab conflict em `/admin/configuracoes` foi testado manualmente e o save stale foi recusado;
- depois do smoke, leitura hospedada confirmou `notice_enabled = false`.

O texto temporário pode permanecer armazenado porque a flag false impede sua projeção pública.

## Invariantes preservados

- Browser não é autoridade para preço, frete, total, ownership, payment ou fulfillment.
- Mercado Pago continua autoridade financeira.
- Melhor Envio continua sem auto-spend e com compra explícita/fail-closed.
- Pedidos continuam privados/owner-scoped.
- Admin continua owner UUID + senha + TOTP/AAL2 + sessão administrativa.
- Falha de e-mail não muda payment/fulfillment/shipping.
- Resend tracking continua OFF.
- Nenhum provider secret virou Store Setting.
- Nenhuma migration aplicada foi reescrita/reaplicada.
- Nenhuma mudança de permissões/`umask` foi necessária para a Phase 7.

## Próximo passo exato

A Phase 7 não possui trabalho de implementação/rollout pendente. O próximo passo é escolher explicitamente o destino da branch:

- integrar em `main`;
- abrir/manter PR para revisão;
- ou manter a branch como está.

Até essa decisão, `feat/phase-7-store-settings` permanece a branch da Phase 7 e Phase 8/9 continuam **NOT STARTED**.

## Registro final

### 2026-09-14 — design e implementação

Spec/plano aprovados; schema, domínio, repository/cache, API/admin UI e projeções públicas implementados em ciclos de regressão/CI.

### 2026-09-14 — hosted rollout

`20260915002740 store_settings` aplicada uma única vez e validada com grants/RLS/RPC/concurrency/audit/advisors.

### 2026-09-14 — Production acceptance

Candidate `db430829...` implantado em KingHost, CI #1589 verde, homepage 200, bug visual de banner corrigido e revalidado, conflito stale-tab recusado e aviso temporário desligado ao final do smoke.
