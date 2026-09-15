# ProxyBembem — Phase 7 / Final Production Acceptance

**Phase:** 7 — Store Settings  
**Branch:** `feat/phase-7-store-settings`  
**Base original:** `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`  
**Runtime aceito em Production:** `db4308296e9f2603e76ded4332394dd58c99a84c`  
**Estado:** **COMPLETE / HOSTED SUPABASE APPLIED + VALIDATED / PRODUCTION ACCEPTED**

Este documento registra a evidência final de rollout da Phase 7. O plano/spec histórico permanece em `docs/superpowers/plans/2026-09-14-store-settings-implementation.md` e `docs/superpowers/specs/2026-09-14-store-settings-design.md`.

## Escopo aceito

Store Settings V1 contém somente cinco valores allowlisted:

- `production_lead_time_business_days`: inteiro 1–15, default 5;
- `contact_email`: contato público opcional;
- `contact_whatsapp_e164`: contato público opcional em E.164;
- `notice_enabled`: flag do aviso público;
- `notice_text`: texto simples opcional, máximo 400 caracteres.

Segredos de Mercado Pago, Melhor Envio, Supabase, Resend, cron, KingHost e qualquer credencial de infraestrutura continuam fora de Store Settings.

## Supabase hospedado

A migration foi aplicada uma única vez no projeto hospedado `ProxyBembem`:

- migration repo: `supabase/migrations/202609140003_store_settings.sql`;
- hosted version: `20260915002740`;
- hosted name: `store_settings`.

A validação hospedada confirmou:

- singleton `public.store_settings`, `id='default'`;
- RLS habilitado;
- `anon` e `authenticated` sem CRUD direto;
- `service_role` com leitura e RPC allowlisted, sem UPDATE direto;
- `admin_update_store_settings(...)` como `SECURITY DEFINER`, owner `postgres`, `search_path=''`;
- optimistic concurrency por `expectedUpdatedAt`;
- mutação e `admin_audit_log` na mesma transação;
- audit contendo apenas os cinco valores allowlisted e actor confiável;
- nenhuma coluna de secret/token/credential/key/password.

Um smoke rollback-only hospedado comprovou update válido, avanço de revisão, stale conflict e exatamente um audit allowlisted; o bloco foi revertido e não deixou fixture sintética persistida.

## Verificação automatizada antes do rollout

O checkpoint pre-rollout passou CI com runtime exato Node 22.1.0, install congelado, typecheck, KingHost build, private-order route contract, startup smoke e suíte automatizada completa.

Após a correção final do banner, o commit de runtime aceito foi:

- `db4308296e9f2603e76ded4332394dd58c99a84c` — `fix: position store notice below fixed navbar`;
- GitHub Actions run #1589 — **PASS**.

A correção adiciona o offset responsivo `top-14 sm:top-16` ao `StoreNotice`, correspondente à altura `h-14 sm:h-16` da navbar fixa, com regressão automatizada cobrindo esse contrato.

## Rollout KingHost

O servidor Production estava em detached HEAD no candidate anterior `476c341cf79cf74cd500231a44722f3ced5fa853`, por isso `git pull --ff-only` não avançava o runtime. O rollout foi corrigido de forma explícita:

1. fetch da branch `feat/phase-7-store-settings`;
2. confirmação de `FETCH_HEAD = db4308296e9f2603e76ded4332394dd58c99a84c`;
3. checkout detached desse SHA;
4. `nvm use` confirmou Node.js `22.1.0`;
5. install `pnpm@10` com lockfile congelado;
6. `NODE_ENV=production npx pnpm@10 deploy:kinghost`;
7. restart da aplicação pelo painel KingHost, sem `pm2 start` manual.

Nenhuma migration foi reaplicada e nenhuma mudança de `umask`, permissões de assets ou `.env.production` fez parte deste rollout.

## Smoke de Production

O endpoint público respondeu:

```text
HTTP/2 200
server: nginx
content-type: text/html; charset=utf-8
```

Com o aviso temporário habilitado, o HTML de Production continha `Teste temporário da configuração da loja`.

O primeiro smoke visual revelou que o aviso estava atrás da navbar fixa. A causa foi isolada no layout: `Navbar` é `fixed top-0` e o `StoreNotice` não tinha offset vertical. Após o fix `db430829...` e novo deploy, evidência visual fornecida pelo proprietário confirmou o aviso totalmente visível imediatamente abaixo da navbar, sem sobreposição.

## Optimistic concurrency em Production

O proprietário executou o teste manual de duas abas em `/admin/configuracoes`:

- uma aba salvou uma revisão mais nova;
- a segunda aba permaneceu stale;
- a tentativa de salvar pela aba stale foi recusada;
- o valor mais recente não foi sobrescrito.

Isso valida o comportamento de conflito esperado no fluxo real do admin, além do rollback-only hospedado e das regressões automatizadas.

## Estado final do aviso temporário

Após o smoke, a leitura direta do singleton hospedado confirmou:

- `notice_enabled = false`;
- o texto temporário pode permanecer armazenado, mas não é projetado publicamente enquanto a flag estiver desligada.

Nenhuma alteração adicional no admin é necessária para encerrar o teste.

## Resultado final

Phase 7 está **COMPLETE / PRODUCTION ACCEPTED** no nível de implementação, banco hospedado, deploy KingHost, smoke público e conflito administrativo.

A integração em `main` **não** faz parte desta aceitação automática e continua dependendo de decisão explícita do proprietário. Phase 8 e Phase 9 permanecem **NOT STARTED** até nova instrução.
