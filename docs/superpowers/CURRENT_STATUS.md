# ProxyBembem Checkout Continuity Status

**Last updated:** 2026-08-31

This file is the canonical continuation checkpoint for the checkout/freight work. Future sessions must read this file before inferring progress from old plan checkboxes.

## Repository state

- Repository: `Bembemm/proxybembem`
- Working branch: `feat/checkout-mercadopago`
- PR: `#2` — `feat: adicionar checkout seguro com Mercado Pago`
- PR state: open, draft, not merged
- Last code-changing functional commit: `803d1483ff2c59d067520044477758900be659c9`
- `1b8dc27a61dab32cb326f9c7713a550b09728431` is an empty `chore: retrigger Vercel preview` commit with the same functional tree as `803d148...`.
- Later commits through `a0a0565ba43359c203fc702b961b63fc1207c22e` are continuity/documentation-only changes; they do not change checkout/OAuth runtime behavior.
- Latest runtime validation in this checkpoint was performed against Vercel deployment `dpl_CryNnUFhKXxa5iKMapfQ4MX6uJAt`, commit `a0a0565...`, state `READY`.
- GitHub Actions CI for `a0a0565...`: run `#427`, conclusion `success`.
- Stable branch alias: `proxybembem-git-feat-che-d3796d-brenobembemm1802-7300s-projects.vercel.app`
- Environment phase: **Preview/Sandbox only**. Production is not approved for rollout yet.

## Historical task numbering and exact continuation point

The working-session numbering used before the Vercel quota block was not fully persisted into the original implementation plans. Preserve these labels here for continuity:

### `3.1.11d` — local fallback validation — COMPLETE

This block was executed because Vercel Preview was temporarily blocked by `build-rate-limit`. Work did not stop; runtime/provider behavior was validated locally against Sandbox and the development Supabase state.

What this block covered:

#### Melhor Envio OAuth single-account lifecycle

The static `MELHOR_ENVIO_ACCESS_TOKEN` approach was superseded by the approved OAuth single-account implementation in:

- `docs/superpowers/specs/2026-08-29-melhor-envio-oauth-single-account-design.md`
- `docs/superpowers/plans/2026-08-29-melhor-envio-oauth-single-account.md`

Implemented/validated behavior includes:

- separate Sandbox/Production provider environments; no cross-environment fallback;
- OAuth scope limited to `shipping-calculate` while labels remain manual;
- protected OAuth start route, one-shot callback and maintenance refresh route;
- OAuth state stored as SHA-256, 10 minute TTL and atomic single-use consumption;
- access/refresh token persistence encrypted with AES-256-GCM and environment/token-kind AAD;
- automatic refresh through Supabase lease + token-version compare-and-set coordination;
- forced-refresh retry behavior for provider authentication failure;
- daily Vercel Cron protected by `CRON_SECRET` and using the same token-manager refresh path;
- OAuth tables/RPCs protected for trusted `service_role` use, with RLS/fail-closed grants;
- real Melhor Envio Sandbox quotation working with the Sandbox service policy (technical IDs `3/4` / Jadlog in Sandbox);
- legacy permanent access-token configuration no longer required by the runtime contract.

The corresponding OAuth migration is already part of the applied Preview/Sandbox migration set:

- `202608290002_melhor_envio_oauth.sql`

The user also configured the required OAuth-oriented environment variables during this phase. **Never record their secret values in this repository or in chat.** The variable names/contracts are documented in `.env.example` and `docs/shipping-setup.md`.

#### Local checkout / Mercado Pago / Supabase acceptance

Fresh local verification included:

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- real Sandbox shipping quote;
- checkout-side shipping requote;
- Mercado Pago Sandbox preference creation;
- checkout retry behavior;
- live concurrent checkout requests for the same attempt;
- Supabase persistence verification.

The live concurrency test confirmed:

- shipping quote returned HTTP `200`;
- both concurrent calls resolved to the same order;
- both concurrent calls resolved to the same Mercado Pago checkout URL;
- retry returned HTTP `200` and reused the same order/URL;
- expected final database state was one order + one persisted preference + cleared lease.

### `3.1.11d.18d` — concurrent Mercado Pago preference race — COMPLETE

A live local concurrency test exposed a race where two preference creations could occur (`2 !== 1`). The fix moved the concurrency guarantee to the server/database rather than relying on Mercado Pago's client idempotency header:

- added an atomic checkout-preference lease in Supabase with a 30 second lease window;
- restricted the lease RPCs to trusted `service_role` execution with `SECURITY DEFINER` and fixed `search_path` hardening;
- added migration `202608300001_checkout_preference_lease.sql`;
- verified claim → busy → reclaim-after-expiry → complete behavior;
- stopped requiring `X-Idempotency-Key` in tests;
- removed `X-Idempotency-Key` from the Mercado Pago preference request;
- final functional commit for this change: `803d1483ff2c59d067520044477758900be659c9` (`fix: rely on server lease for preference concurrency`).

### `3.1.11b` — Preview/Vercel runtime acceptance — IN PROGRESS

This was the task originally blocked by the Vercel daily build-rate limit. The block is cleared. Do **not** repeat the completed OAuth implementation or the local concurrency work unless a Preview failure specifically points back to them.

## `3.1.11b` progress — 2026-08-31

Completed against the current functional tree on Preview:

- [x] Confirmed branch Preview is `READY` on the stable branch alias.
- [x] Confirmed current GitHub Actions CI success (`#427`).
- [x] Storefront `/` returns HTTP `200` on Preview.
- [x] `/admin/integrations/melhor-envio` returns HTTP `200` and still shows the expected owner-secret bootstrap form.
- [x] Existing valid approved order page returns HTTP `200` from Preview and successfully reads the trusted Supabase order snapshot, including approved status, products, totals, freight and delivery data.
- [x] Supabase project is `ACTIVE_HEALTHY` in `sa-east-1`.
- [x] Melhor Envio Sandbox OAuth credential row is `active`, token version `5`, access token expiry `2026-09-29`, no refresh lease and no recorded auth failure.
- [x] Recent checkout orders have no stale checkout-preference lease.
- [x] Unauthenticated `GET /api/internal/melhor-envio/refresh` returns HTTP `401 {"ok":false}` as designed.
- [x] Current deployment build error filter contains no build error; build completed successfully.
- [x] Current deployment runtime logs for the checks above contain expected `200/401` results and no unexpected runtime error.

Still required before marking `3.1.11b` complete:

- [ ] Real `POST /api/shipping/quote` against the **current** Preview deployment, confirming expected Sandbox service policy.
- [ ] Preview checkout acceptance with `quantity=1`: quote → checkout requote → Mercado Pago Sandbox preference → order/return page.
- [ ] Preview checkout acceptance with `quantity=2`.
- [ ] Preview retry/idempotency check proving the same checkout attempt reuses the same order/preference URL.
- [ ] Authenticated Cron/refresh check using the deployed secret without exposing it, expecting HTTP `200` when authorized.
- [ ] Final Supabase verification after those new Preview checkouts: no duplicate order/preference and no stale preference lease.
- [ ] Final runtime-log review after the POST acceptance tests.

### Tooling limitation recorded for continuity

In the 2026-08-31 ChatGPT session, the connected Vercel fetch action can access protected Preview pages but supports GET requests only. The available local shell has no external DNS/network access. Therefore this session cannot directly issue the protected Preview `POST` requests required for shipping quote and checkout acceptance, nor can it send the authenticated Cron secret without reading/exposing that secret.

A project-wide runtime log did show a `POST /api/shipping/quote 200` at 03:14:32, but it belonged to older deployment `dpl_3i7mr13QKGJxbfDVF79F9aX7Pabs` / commit `b67da843...`, not the current Preview deployment, so it **does not count** as current-head acceptance.

A future session with interactive browser/Cloud Browser/agent-browser access to the protected Preview, or an authorized runner that can POST to it without exposing secrets, should continue with the unchecked items above. Do not restart from `3.1.11d`.

### Completion gate for `3.1.11b`

Mark `3.1.11b` complete only when the remaining current-Preview POST checks pass. A green build and GET-only runtime checks are not the full acceptance gate.

## Current migrations applied to Preview/Sandbox

In order:

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`

## Current environment contract (names only)

Do not store values in this file.

### Mercado Pago

- `MERCADO_PAGO_ENVIRONMENT`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`

### Supabase

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

### Melhor Envio OAuth / shipping

- `MELHOR_ENVIO_ENVIRONMENT`
- `MELHOR_ENVIO_CLIENT_ID`
- `MELHOR_ENVIO_CLIENT_SECRET`
- `MELHOR_ENVIO_REDIRECT_URI`
- `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY`
- `MELHOR_ENVIO_OAUTH_ADMIN_SECRET`
- `MELHOR_ENVIO_USER_AGENT`
- `SHIPPING_ORIGIN_CEP`
- `SHIPPING_QUOTE_SECRET`
- `CRON_SECRET`

### Other server security

- `RATE_LIMIT_SECRET`

Preview/Sandbox and Production provider credentials must remain separate.

## Important distinction: Melhor Envio OAuth vs site admin authentication

**Melhor Envio OAuth is implemented and was part of the completed local validation.**

The site's `/admin` area, however, is **not yet using Supabase Auth**. At this checkpoint, `app/admin/integrations/melhor-envio/page.tsx` still asks for the `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` to bootstrap the owner OAuth action.

Replacing that admin secret form with a real authenticated admin session is a separate future design/change. Do not describe the existing Melhor Envio OAuth implementation as incomplete just because Supabase Auth for `/admin` has not been added.

## Post-checkout objective: migrate Vercel + Supabase to KingHost

The owner has an active KingHost plan and the intended long-term infrastructure is **not** to keep Vercel + Supabase permanently. After the checkout/payment/freight work is finished and validated, plan and execute a separate migration phase to KingHost.

This is a **post-checkout objective**, not the current task. Do not interrupt `3.1.11b` or the remaining checkout rollout gates to begin this migration unless the owner explicitly changes priority.

The migration phase must first inventory the functionality currently supplied by Vercel and Supabase, then choose the exact KingHost architecture before moving anything. At minimum, account for:

- Next.js storefront and server/API routes currently hosted by Vercel;
- environment variables and server secrets;
- custom domain, DNS, HTTPS/TLS and rollout/cutover behavior;
- Vercel Cron replacement for Melhor Envio token maintenance;
- Supabase PostgreSQL schema, migrations and production data;
- RLS/grants, RPC functions, leases and atomic payment/order operations currently implemented in PostgreSQL;
- Supabase Auth if admin authentication has been added by that point;
- server-side privileged database access equivalent to the current Supabase service-role model;
- Melhor Envio OAuth callback URLs and stored encrypted credential state;
- Mercado Pago webhook/return URLs;
- backups, migration validation, rollback plan and low-risk DNS cutover;
- removal of old Vercel/Supabase dependencies only after the KingHost replacement has been validated.

Do **not** assume today that every Supabase feature has a one-to-one KingHost equivalent. The migration must be designed from the actual KingHost plan/capabilities available at that future point and should preserve the existing security guarantees instead of weakening them for convenience.

Future sessions should treat KingHost as the planned final hosting/infrastructure destination after checkout completion, while Vercel + Supabase remain the active development/validation platform for the current work.

## Not yet approved / not yet complete

Do not start these before finishing the Preview gate unless the owner explicitly changes priority:

- Production rollout.
- Production Mercado Pago credentials/webhook.
- Production Melhor Envio credentials/OAuth authorization.
- Production verification that Melhor Envio returns Correios service IDs `1/2` (PAC/SEDEX); do not silently launch Production shipping with Sandbox/Jadlog assumptions.
- First controlled real Mercado Pago transaction and Production webhook verification.
- Supabase Auth-based admin login/session (separate future change).
- Post-checkout KingHost migration design/execution.
- Marking PR #2 ready for review.
- Merging PR #2 into `main`.

Never merge `main` without explicit owner approval.

## Documentation map

Read in this order when resuming work:

1. **This file:** `docs/superpowers/CURRENT_STATUS.md` — live continuation checkpoint and current task.
2. `docs/superpowers/plans/2026-08-29-melhor-envio-oauth-single-account.md` — OAuth implementation plan; its unchecked boxes are historical planning state, not proof that code is missing.
3. `docs/shipping-setup.md` — current Melhor Envio setup/runbook.
4. `docs/payments-setup.md` — Mercado Pago setup/runbook.
5. `docs/superpowers/plans/2026-08-28-implementation-manifest.md` — original checkout/freight hardening execution decisions.
6. Relevant design specs under `docs/superpowers/specs/`.

## Rule for every future work session

Before coding:

1. read this file;
2. verify the branch HEAD and current provider/deployment state;
3. continue from **Current task**, not from unchecked boxes in older plans;
4. do not repeat a completed acceptance block unless evidence shows a regression.

Before ending a meaningful work session, update this file with:

- last functional/tested HEAD;
- task just completed;
- tests/acceptance evidence;
- blocker if any;
- exact next task/action;
- any decision that a future session must not rediscover.

## Next-session instruction

**Continue `3.1.11b` from the remaining unchecked POST/Cron acceptance items above.** Do not rebuild Melhor Envio OAuth and do not redo `3.1.11d` local concurrency tests unless a current Preview regression specifically requires it.