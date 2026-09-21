# ProxyBembem — Phase 7 / Final Production Acceptance

**Phase:** 7 — Store Settings  
**Branch histórica:** `feat/phase-7-store-settings`  
**Base original:** `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`  
**Runtime final aceito em Production:** `3fd88688a6cfae343fea3b346a3d1cad1035eb86`  
**Estado:** **COMPLETE / HOSTED SUPABASE APPLIED + VALIDATED / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN**

Este documento registra a evidência final de rollout da Phase 7. O plano/spec histórico permanece em `docs/superpowers/plans/2026-09-14-store-settings-implementation.md` e `docs/superpowers/specs/2026-09-14-store-settings-design.md`.

## Escopo aceito

Store Settings V1 contém somente cinco valores allowlisted:

- `production_lead_time_business_days`: inteiro 1–15, default 5;
- `contact_email`: contato público opcional;
- `contact_whatsapp_e164`: contato público opcional em E.164;
- `notice_enabled`: flag do aviso público;
- `notice_text`: texto simples opcional, máximo 400 caracteres.

Segredos de Mercado Pago, Melhor Envio, Supabase, Resend, cron, Vercel e qualquer credencial de infraestrutura continuam fora de Store Settings.

## Supabase hospedado

A migration foi aplicada uma única vez no projeto hospedado `ProxyBembem`:

- migration repo: `supabase/migrations/202609140003_store_settings.sql`;
- hosted version: `20260915002740`;
- hosted name: `store_settings`.

A validação hospedada confirmou singleton `public.store_settings`, RLS, grants mínimos, RPC allowlisted `SECURITY DEFINER`, optimistic concurrency, audit atômico e ausência de colunas de secrets/tokens/credentials. O smoke rollback-only comprovou update válido, avanço de revisão, stale conflict e audit allowlisted sem deixar fixture sintética persistida.

## Consistência global dos settings

O follow-up final da Phase 7 removeu consumidores públicos divergentes e tornou Configurações a fonte de verdade para a mesma informação pública.

O commit de runtime final foi:

`3fd88688a6cfae343fea3b346a3d1cad1035eb86` — `fix: make store settings globally authoritative`.

A correção cobre:

- refresh do tree server-side após save bem-sucedido em `/admin/configuracoes`, evitando props antigas na mesma sessão;
- e-mail/WhatsApp público consumido dinamicamente por footer, `/contato`, carrinho, suporte de pedido e páginas legais relevantes;
- prazo de produção consumido pela FAQ e pelo detalhe de produto, inclusive substituindo cópia antiga de `PRAZO`/destaque sem reescrever produto histórico no banco;
- nenhum acoplamento de buyer/customer contact, remetente `noreply`, secrets de provider ou prazo de transportadora aos Store Settings.

## Verificação automatizada

O ciclo TDD comprovou RED nos três contratos novos antes da implementação. Após a implementação e atualização dos testes antigos para o novo contrato global, o mesmo runtime passou o pipeline completo.

GitHub Actions CI #1613 / run `34923612641`: **PASS** no SHA `3fd88688...`.

O gate incluiu runtime Node.js 22.x, install com lockfile congelado, typecheck, Vercel build, private-order route contract, startup smoke e suíte automatizada.

## Integração em `main`

Antes da integração, `feat/phase-7-store-settings` estava 60 commits à frente e 0 atrás de `main`, com merge-base no antigo HEAD da `main`.

Com autorização explícita do proprietário, `main` foi avançada por fast-forward para `3fd88688a6cfae343fea3b346a3d1cad1035eb86`, sem force update. O CI #1613 rodou no próprio `main` e concluiu com sucesso no mesmo SHA.

## Rollout Vercel

O checkout Production ainda estava em detached HEAD no runtime anterior `db4308296e9f2603e76ded4332394dd58c99a84c`.

Durante a normalização:

1. `origin/main` foi buscada explicitamente;
2. confirmou-se `origin/main = 3fd88688...`;
3. um checkout inicial tentou criar tracking antes de o remote considerar `main` branch rastreável e deixou apenas o index montado com a árvore de `main`;
4. foi comprovado que `git write-tree` e `origin/main^{tree}` eram ambos `70bd56c613c873327f809ceecb8a1f8158fa6a75`, sem diferença de working tree;
5. o estado foi corrigido sem descartar dados: criou-se a branch local `main`, adicionou-se `main` ao fetch refspec do remote e configurou-se tracking para `origin/main`;
6. `git status -sb` ficou `## main...origin/main` e `HEAD = 3fd88688...`;
7. `nvm use`, install congelado e `NODE_ENV=production npx pnpm@10 build` concluíram;
8. restart foi feito pelo painel Vercel, sem PM2 manual.

Nenhuma migration foi reaplicada.

## Smoke de Production

Após o restart:

```text
HTTP/2 200
server: nginx
content-type: text/html; charset=utf-8
```

O commit em Production foi confirmado como `3fd88688a6cfae343fea3b346a3d1cad1035eb86`.

O build Next.js alterou automaticamente `next-env.d.ts` de referências dev para referências de produção; depois de verificada a diferença, o arquivo foi restaurado para manter o checkout limpo. Isso não altera o runtime já construído em `.next`.

O proprietário executou o smoke funcional final e confirmou que a mudança de Configurações passou a refletir corretamente nos consumidores públicos globais testados, incluindo contato e prazo. O stale-tab conflict já havia sido validado anteriormente e continua preservado.

## Resultado final

Phase 7 está **COMPLETE / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN** no nível de implementação, banco hospedado, CI, deploy Vercel e smoke funcional.

Phase 8 e Phase 9 permanecem **NOT STARTED** até nova instrução explícita.
