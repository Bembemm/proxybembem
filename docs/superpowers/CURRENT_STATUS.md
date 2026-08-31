# ProxyBembem Checkout Continuity Status

**Last updated:** 2026-08-31

This file is the canonical continuation checkpoint for the checkout/freight work. Future sessions must read this file before inferring progress from old plan checkboxes.

## Repository state

- Repository: `Bembemm/proxybembem`
- Working branch: `feat/checkout-mercadopago`
- PR: `#2` — `feat: adicionar checkout seguro com Mercado Pago`
- PR state: open, draft, not merged
- Last functional/tested HEAD before this documentation-only checkpoint: `1b8dc27a61dab32cb326f9c7713a550b09728431`
- Last code-changing functional commit: `803d1483ff2c59d067520044477758900be659c9`
- Tree is unchanged between `803d148...` and `1b8dc27...`; `1b8dc27...` is an empty `chore: retrigger Vercel preview` commit created only to restart Preview after the Vercel build-rate limit cleared.
- The commit that adds/updates this continuity documentation is intentionally documentation-only. Future sessions must verify the actual branch HEAD before making changes instead of assuming the SHA written here is still the tip.
- GitHub CI on `1b8dc27...`: passing.
- Vercel Preview on `1b8dc27...`: `READY`.
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

### `3.1.11b` — Preview/Vercel runtime acceptance — CURRENT TASK

This was the task that was originally blocked by the Vercel daily build-rate limit. The block is now cleared and a Preview for the last functional/tested HEAD is `READY`, so work resumes here.

Do **not** repeat the already-completed OAuth implementation or the local concurrency work unless a Preview failure specifically points back to them.

## Current task: `3.1.11b` Preview/Vercel acceptance

Use the stable Preview branch alias and validate the current functional tree in Vercel runtime.

Recommended order:

1. Confirm the current branch HEAD and that Vercel Preview is `READY`.
2. Load the storefront and the admin integration page in Preview.
3. Do **not** reauthorize Melhor Envio just because a new Preview exists. Existing Sandbox OAuth credentials should be reused while valid.
4. If a new OAuth authorization is genuinely required, first make sure the Melhor Envio Sandbox callback and `MELHOR_ENVIO_REDIRECT_URI` point to the stable Preview alias callback exactly; do not use a disposable deployment hostname.
5. Execute a real Melhor Envio Sandbox quote from Preview and confirm only the expected Sandbox service policy is exposed.
6. Execute Preview checkout with `quantity=1`: quote → checkout requote → Mercado Pago Sandbox preference → return/order page.
7. Execute the live acceptance case with `quantity=2` as required by the rollout manifest.
8. Verify retry/idempotency behavior still reuses the existing order/preference URL.
9. Verify the maintenance refresh/Cron route in Vercel runtime with its auth behavior. Never expose `CRON_SECRET` in logs or chat.
10. Verify the resulting Supabase rows remain consistent: no duplicate order/preference for the same checkout attempt and no stale preference lease.
11. Review Vercel runtime/build logs for unexpected errors.
12. Update this file with the exact result and next task before ending the work session.

### Completion gate for `3.1.11b`

Mark `3.1.11b` complete only when the current Preview tree passes the runtime acceptance checks above. A green build alone is not the full acceptance gate.

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

## Not yet approved / not yet complete

Do not start these before finishing the Preview gate unless the owner explicitly changes priority:

- Production rollout.
- Production Mercado Pago credentials/webhook.
- Production Melhor Envio credentials/OAuth authorization.
- Production verification that Melhor Envio returns Correios service IDs `1/2` (PAC/SEDEX); do not silently launch Production shipping with Sandbox/Jadlog assumptions.
- First controlled real Mercado Pago transaction and Production webhook verification.
- Supabase Auth-based admin login/session (separate future change).
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

**Start at `3.1.11b` Preview/Vercel runtime acceptance.** The Vercel build-rate blocker is resolved and the last functional/tested Preview is `READY`; the next work is runtime acceptance, not rebuilding OAuth or redoing `3.1.11d` local concurrency tests.