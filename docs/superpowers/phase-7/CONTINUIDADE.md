# ProxyBembem — Phase 7 / Continuidade

**Branch histórica:** `feat/phase-7-store-settings`  
**Base inicial:** `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`  
**Branch canônica atual:** `main`  
**Runtime final aceito:** `3fd88688a6cfae343fea3b346a3d1cad1035eb86`  
**Estado final:** **COMPLETE / HOSTED SUPABASE APPLIED + VALIDATED / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN**

Este arquivo é o handoff final da Phase 7. Para a evidência completa, ler `docs/superpowers/phase-7/FINAL_ACCEPTANCE.md`.

## Regra para qualquer continuação

1. Ler `docs/PROJECT_MASTER_OVERVIEW.md`.
2. Ler `docs/superpowers/CURRENT_STATUS.md`.
3. Ler este arquivo e `docs/superpowers/phase-7/FINAL_ACCEPTANCE.md`.
4. Não reabrir Phases 0–7 sem regressão concreta ou pedido explícito.
5. Não reescrever/reaplicar migrations hospedadas; correções futuras são aditivas.
6. Não fazer squash, rebase, branch deletion ou force-move sem aprovação explícita do proprietário.
7. Não iniciar Phase 8 ou 9 automaticamente.

## Escopo V1 entregue

Store Settings contém somente:

- `production_lead_time_business_days`: 1–15, default 5;
- `contact_email`: público/opcional;
- `contact_whatsapp_e164`: público/opcional/E.164;
- `notice_enabled`: booleano;
- `notice_text`: texto simples opcional, máximo 400 caracteres.

Fora de escopo: pause store, preços globais, frete manual, controles financeiros, auto-compra de etiqueta, provider secrets/credentials e settings arbitrários.

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
- UI: `/admin/configuracoes`, save explícito, validação por campo, conflito 409 estável e sem autosave;
- após save bem-sucedido, `router.refresh()` renova o tree server-side para que o layout público persistente não conserve settings antigos na mesma sessão.

### Projeção pública

- root shell recebe somente `PublicStoreSettings` sanitizado;
- fallback seguro: prazo 5, aviso off e contatos ausentes quando a leitura pública falha;
- FAQ usa prazo configurado;
- footer e `/contato` usam contatos configurados e omitem canais ausentes;
- `/privacidade` e `/trocas-e-reembolsos` não mantêm e-mail público hardcoded;
- banner usa texto simples e aparece somente quando `noticeEnabled && noticeText`;
- carrinho recebe WhatsApp configurado e não inventa destino quando ausente;
- suporte do pedido privado resolve ownership antes de usar settings;
- detalhes do produto tratam a seção/destaque de prazo como projeção global do `productionLeadTimeBusinessDays`, sem reescrever registros históricos no banco;
- buyer/customer contacts, remetente transacional `noreply`, provider identity e prazo da transportadora permanecem domínios separados;
- nenhuma credencial de infraestrutura é projetada ao browser.

## Evidência de CI

Runtime final:

`3fd88688a6cfae343fea3b346a3d1cad1035eb86` — `fix: make store settings globally authoritative`.

GitHub Actions CI #1613 / run `34923612641`: **PASS** no próprio `main` e no mesmo SHA.

O pipeline cobre runtime Node 22.1.0, install congelado, typecheck, KingHost build, private-order contract, startup smoke e suíte automatizada.

## Hosted Supabase — concluído

A migration foi aplicada uma única vez. Verificações hospedadas confirmaram singleton, grants, RLS, constraints, RPC e ausência de campos secretos.

O teste rollback-only da RPC comprovou update válido, avanço de `updated_at`, audit allowlisted e tentativa stale recusada; rollback final não persistiu fixture sintética.

Não reaplicar `20260915002740 store_settings`.

## KingHost / Production — concluído

Runtime implantado: `3fd88688a6cfae343fea3b346a3d1cad1035eb86`.

O checkout Production foi normalizado de detached HEAD para branch local `main` rastreando `origin/main`. O estado intermediário do index foi verificado por igualdade exata de tree SHA antes da correção, evitando descarte cego de arquivos.

`nvm use`, install e deploy seguiram o runbook KingHost; restart ocorreu pelo painel, sem iniciar PM2 manualmente. Homepage respondeu `HTTP/2 200`.

O smoke funcional final do proprietário confirmou propagação global dos settings públicos testados. O conflito stale-tab permanece recusando sobrescrita de revisão mais nova.

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
- Nenhuma mudança insegura de permissões fez parte do rollout.

## Próximo passo exato

A Phase 7 não possui trabalho de implementação, integração ou rollout pendente.

A base para trabalho novo é `main`. Phase 8 e Phase 9 continuam **NOT STARTED** e exigem instrução explícita do proprietário.

A branch histórica `feat/phase-7-store-settings` pode ser mantida como referência; sua exclusão não é necessária para a correção e não deve ser feita sem pedido explícito.

## Registro final

### 2026-09-14 — design, implementação e hosted rollout

Spec/plano aprovados; schema, domínio, repository/cache, API/admin UI e projeções públicas implementados. `20260915002740 store_settings` foi aplicada uma única vez e validada com grants/RLS/RPC/concurrency/audit.

### 2026-09-14 — primeira Production acceptance

Runtime `db430829...` implantado; banner corrigido para ficar abaixo da navbar; conflito stale-tab validado; aviso temporário desligado ao final.

### 2026-09-15 — consistência global, integração e aceitação final

Consumidores públicos foram auditados e corrigidos para obedecer Store Settings globalmente; `main` avançou por fast-forward para `3fd88688...`; CI #1613 passou; KingHost foi normalizada para `main`; Production respondeu HTTP/2 200 e o smoke funcional do proprietário confirmou a propagação global esperada.
