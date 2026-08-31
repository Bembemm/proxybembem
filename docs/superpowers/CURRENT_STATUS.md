# ProxyBembem Checkout — Current Status

**Updated:** 2026-08-31

This is the canonical continuation checkpoint. Read this file before older plan checkboxes.

## Repository / safety constraints

- Repo: `Bembemm/proxybembem`
- Active branch: `feat/checkout-mercadopago`
- PR `#2`: `feat: adicionar checkout seguro com Mercado Pago`, base `main`, open, ready for review and unmerged.
- Never merge `main` without explicit owner approval.
- Never expose provider, Supabase, password, TOTP or other secret values in chat, screenshots, logs, docs or commits.
- Recent storefront/branding changes are Preview-only until the owner explicitly approves a Production promotion.
- KingHost migration remains deferred until this branch is finalized.

## Production checkout rollout — COMPLETE

The checkout/payment/freight/admin security flow was validated end to end on `https://www.proxybembem.com.br` before the newer storefront presentation work began.

Validated in Production:

- Admin login with password + mandatory Authenticator TOTP/AAL2;
- one active admin application session with strict 30-minute inactivity timeout;
- Melhor Envio Production OAuth active;
- Production freight restricted to Correios PAC/SEDEX service IDs `1/2`;
- Mercado Pago Production preference creation;
- one legitimate controlled real payment;
- signed Mercado Pago Webhook accepted with HTTP `200`;
- payment fetched from Mercado Pago before state transition;
- Supabase order transitioned `pending` → `approved`, detail `accredited`;
- public order page returned HTTP `200`;
- temporary R$ 5 validation product/route removed afterward;
- `/validacao-pagamento` returns `404` in Production.

The controlled acceptance transaction used the temporary R$ 5 item plus real SEDEX and totaled R$ 19,22. The helper no longer exists; historical orders remain as database history.

### Mercado Pago Webhooks-only follow-up

During the controlled payment, valid signed Webhooks succeeded while additional legacy unsigned notifications reached the same endpoint and received `401`. The preference was then changed to request Webhooks-only delivery using `source_news=webhooks`.

- RED commit: `6e11935fec7975ae88b6c419abe00279db647530`
- GREEN fix: `f9beda55879b1836fa55c3c8262c7dd99db2b3b6`
- CI `#652`: tests + typecheck + build passed
- fix promoted to Production successfully.

No second real payment was required solely for that notification selector change.

### Production cleanup baseline

Final cleanup Production deployment before the newer presentation work:

- deployment `dpl_3cywxYxepJpAJCWnZ6jLQzQFb7Xb`
- commit `f31925a5ab3cbba02f7a5fba572318b2dcccac8b`
- target `production`, state `READY`
- aliases include `www.proxybembem.com.br` and `proxybembem.com.br`.

Do not confuse this live baseline with the newer Preview-only storefront/branding commits below.

## Storefront consolidation — PREVIEW VALIDATED, NOT YET PRODUCTION

Owner-approved behavior:

- home is now the main storefront and renders the complete trusted product catalog;
- hero leads directly to `#produtos`;
- navbar `Produtos` points to `/#produtos`;
- legacy `/produtos` redirects to `/#produtos`;
- product cards are larger/more interactive and show discount percentage and savings;
- 60-card deck advertises R$ 99,99 original price and R$ 69,99 sale price;
- Commander remains R$ 150,00 → R$ 119,90.

TDD/verification:

- RED commit `3e748b94f3f2fdb606921db7be664924a1b4e00e`
- RED CI `#670`: 219 tests, 215 passed, exactly four new contract tests failed
- implementation commits: `e7d66cbe...`, `db413273...`, `7edb873...`, `b9af679...`
- GREEN CI `#678`: tests + typecheck + build passed
- Preview `dpl_BVW7RMaWhJSarYSnncsSx2vGJEQ5` was `READY`.

The server-authoritative checkout price for product ID `2` remains R$ 69,99.

## Product-detail modal refresh — PREVIEW VALIDATED, NOT YET PRODUCTION

Owner-approved presentation for both products:

- quick highlights near the price;
- buyer-first short description;
- detail blocks: `O QUE VOCÊ RECEBE`, `QUALIDADE`, `VERSO`, `COMO ESCOLHER AS CARTAS`, `ARTES`;
- photographic paper + lamination copy;
- white-back disclosure + opaque-sleeve recommendation;
- separate `IMPORTANTE` disclosure for non-official proxy / no sanctioned tournaments;
- calmer information hierarchy instead of the large yellow warning.

TDD/verification:

- RED commit `29dc4a4c0e6d95e977d859413e412d75c4e4249f`
- RED CI `#682`: 222 tests, 219 passed, exactly three new tests failed
- implementation commits `25f057e1...`, `86d878cc...`, `cb085033...`
- GREEN CI `#688`: tests + typecheck + build passed
- documentation checkpoint `39b0268c...` had CI `#690` success.

The original modal implementation used a 3-business-day promise, but the owner later changed the production window to five business days. The current branch state below supersedes the old 3-day copy.

## PB branding + 5-business-day production window — PREVIEW VALIDATED, NOT YET PRODUCTION

The owner approved replacing the default/Vercel-looking shared icon with the purple `PB` mark extracted from the supplied ProxyBembem logo, while keeping the `ProxyBembem` word next to it in navbar/footer.

Current branch behavior:

- `public/icon.svg` now contains the supplied purple `PB` artwork instead of the previous default icon;
- the same `/icon.svg` is used by the browser favicon, navbar and footer;
- navbar/footer keep the `ProxyBembem` text next to the PB mark;
- product quick highlights now say `Produção em até 5 dias úteis` for both products;
- product `PRAZO` now says `Produção e postagem em até 5 dias úteis.`;
- FAQ now says `Após a confirmação do pagamento, o prazo de produção é de até 5 dias úteis.`;
- stale FAQ wording `pagamento via Pix` and `1 a 3 dias úteis` was removed;
- FAQ delivery copy now defers to the selected freight service/region instead of promising a fixed delivery range.

Important implementation note: `app/layout.tsx` still references `/apple-icon.png` for the Apple touch icon. The normal browser favicon and visible navbar/footer branding use the new PB `/icon.svg`. If the owner later wants the iOS add-to-home-screen icon replaced too, prepare a dedicated raster Apple touch icon rather than assuming SVG support.

TDD evidence:

- 5-day product-copy test commit `034bbf8936a4c650a732d2e48a7f210be0f7ac61`;
- PB/FAQ contract test commit `88d84c65150d255400363ccc200765d696f330df`;
- test portability adjustment `30a0d85134ad5c541bb285aa423470213973a9e0`;
- RED CI `#694`: 224 tests total, 220 passed, exactly four expected failures (PB icon, FAQ, product highlight, product deadline);
- product 5-day implementation `e21e966792252b6bb7d964e53a50827cd198c49c`;
- FAQ implementation `d86a024090a0028d4a26903dad12b20fbe28f8cb`;
- PB icon implementation `6e7838b468f02f885f66b7870d561d9d913e575b`;
- GREEN CI `#702`: `pnpm test`, `pnpm typecheck` and `pnpm build` all passed.

Preview evidence for code commit `6e7838b468f02f885f66b7870d561d9d913e575b`:

- deployment `dpl_BhHmdCzBKdkCAkacQgmArrMRyUdc` is `READY`;
- Preview URL: `proxybembem-aijm4g39u-brenobembemm1802-7300s-projects.vercel.app`;
- `/icon.svg` returned HTTP `200`, `image/svg+xml`, title `ProxyBembem PB` and the embedded PB artwork;
- Preview `/` returned HTTP `200` and references `/icon.svg` for favicon, navbar and footer;
- client-only modal opening cannot be proven by a static HTML fetch, so manual mobile/desktop visual review remains appropriate before Production.

## Admin Auth — COMPLETE

Security model remains unchanged by the storefront work:

- one manually provisioned admin;
- public signup disabled;
- authorization by immutable Supabase UUID in server-only `ADMIN_USER_ID`;
- email/password + mandatory TOTP Authenticator;
- AAL2 required for protected admin access;
- no SMS fallback or trusted-device bypass;
- one active app session;
- strict 30-minute inactivity timeout;
- fresh activation requires recent password + TOTP evidence;
- revoked/expired sessions cannot regain access;
- auth/session/storage failures fail closed;
- Melhor Envio OAuth start requires valid AAL2 admin access.

Applied migration: `202608310001_admin_sessions.sql`.

## Applied Supabase migrations

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`
7. `202608310001_admin_sessions.sql`

## PR / integration state

PR `#2` is open, ready for review and unmerged. The branch contains the Production-accepted checkout stack plus the newer Preview-only storefront consolidation, modal refresh, 5-day production copy and PB branding.

Next safe steps:

1. Wait for CI/Preview on this documentation-only checkpoint commit.
2. Let the owner manually review the newest Preview on mobile/desktop.
3. Do not promote these newer presentation changes to Production until the owner explicitly approves it.
4. After any future promotion, verify canonical domain home, prices, `/produtos` redirect, PB favicon/header/footer and 5-day copy.
5. Do **not** merge to `main` until the owner explicitly approves the merge.
6. Begin KingHost migration only after branch finalization as a separate risk-isolated phase.

No new real Mercado Pago payment is required for these presentation/copy/branding changes because payment/freight processing code and trusted sale prices were not changed.

## End-of-session rule

Every meaningful session must update this file with passed/failed evidence, blockers, exact next action, relevant HEAD/deployment evidence and decisions future sessions must not rediscover.

**Resume point:** checkout/payment/freight/Admin Production acceptance is complete. The home-as-storefront, refreshed product modal, five-business-day production copy and new PB branding are GREEN and Preview-validated but **not yet live in Production**. Latest functional Preview is `dpl_BhHmdCzBKdkCAkacQgmArrMRyUdc` at code commit `6e7838b...`. Wait for CI/Preview on this documentation checkpoint, then get explicit owner approval before Production promotion. Never merge `main` without explicit owner approval.
