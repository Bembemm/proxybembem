# ProxyBembem — Current Status

**Updated:** 2026-09-01

This is the canonical continuation checkpoint. Read this file before older plan checkboxes.

## Active next project — Admin dashboard + customer account expansion

- Active planning branch: `feat/admin-dashboard-expansion`.
- Branch base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`.
- Architectural design committed at `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`.
- Design commit: `325922ffe3eec7440d86cbf86d062aaef8a6ab03`.
- State: **DESIGN WRITTEN — AWAITING OWNER WRITTEN-SPEC REVIEW**.
- No implementation code for this expansion has started.
- No new database migration for this expansion has been applied.
- No Preview or Production deployment for this expansion has been approved.
- After the owner approves the written spec, the next required workflow step is to create the detailed executable implementation/master plan at `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` before implementation begins.

### Approved architectural decisions future sessions must not rediscover

- Use a modular monolith inside the existing Next.js + Supabase application.
- Keep `/admin`; security must not depend on hiding/randomizing the URL.
- Preserve existing admin password + mandatory TOTP/AAL2, single-session, inactivity, and fail-closed authorization.
- Payment status remains Mercado Pago/provider-authoritative and cannot be manually forced by an admin database edit.
- Fulfillment is independent from financial status: `awaiting_payment -> awaiting_production -> in_production -> ready_to_ship -> shipped -> completed`; `canceled` is exceptional/terminal where valid.
- Refund/chargeback creates attention without falsifying the physical fulfillment stage.
- Orders keep immutable purchase snapshots; catalog changes never rewrite historical orders.
- Add order event history and append-only administrative audit.
- Customer address may be corrected before label purchase; after label purchase it cannot silently diverge from the purchased label.
- Customer account uses email + permanent password + email verification + password recovery; email is unique, names are not identifiers, and the internal customer UUID is authoritative.
- Guest checkout remains supported and the existing public-token order tracking remains available.
- Guest/old order claiming requires trusted proof and never relies on matching name alone.
- Customer and admin authorization remain separate security boundaries.
- Move catalog authority to Supabase in stages; checkout remains server-authoritative and static catalog is removed only after equivalence/rollback validation.
- Melhor Envio label permissions are expanded with least privilege only when implementing labels; label purchase never happens automatically after payment and always requires explicit admin confirmation.
- Read-only tracking synchronization may be automatic when safe.
- Transactional email uses an outbox/job model so email-provider failure cannot break payment/order state.
- Store settings expose only safe commercial/operational values; secrets remain runtime/environment configuration.
- Admin UI follows the current admin visual model; customer account follows the storefront visual identity.
- Migrations are compatibility-first/additive before tightening constraints.
- Existing historical orders must not receive fabricated production/shipping history.
- `IMPLEMENTED`, `TESTED`, `PREVIEW APPROVED`, and `PRODUCTION APPROVED` are distinct states.

## Repository / integration state

- Repo: `Bembemm/proxybembem`.
- Default/integration branch: `main`.
- PR `#2` (`feat: adicionar checkout seguro com Mercado Pago`) was explicitly approved by the owner and merged into `main` on 2026-09-01.
- PR merge commit: `1f0bff2c88901a5e0bd0c910e3f650264bceb79b`.
- Source branch was `feat/checkout-mercadopago`; do not assume it has been deleted.
- CI `#743` on the merge commit completed successfully with `pnpm test`, `pnpm typecheck`, and `pnpm build` all passing.
- Never expose provider, Supabase, password, TOTP, payment, or other secret values in chat, screenshots, logs, docs, or commits.

## Production — COMPLETE

Canonical site:

- `https://www.proxybembem.com.br`
- `https://proxybembem.com.br`

The approved presentation bundle was first promoted from Preview to Production, then the merged `main` commit triggered the normal Git-based Production deployment.

Merge-triggered Production evidence:

- deployment `dpl_8AZsHDWCtGmSv1rvCDeVjwJfy7qt`;
- Git commit `1f0bff2c88901a5e0bd0c910e3f650264bceb79b`;
- branch `main`;
- target `production`;
- state `READY`;
- aliases include `www.proxybembem.com.br`, `proxybembem.com.br`, and `proxybembem.vercel.app`.

Previously owner-approved Preview/promotion evidence:

- approved Preview `dpl_Fi7y1xejJKZqjEMx4cVZhgRXuEma`;
- promotion deployment `dpl_71TXqkwdGrR5ZkuLhaJETr14grho`;
- production promotion metadata recorded `action=promote` and `originalDeploymentId=dpl_Fi7y1xejJKZqjEMx4cVZhgRXuEma`.

## Live storefront behavior

- Home uses the newer hero and shows only featured products.
- Hero `Ver produtos` points to `/produtos`.
- Home `Ver Todos os Produtos` points to `/produtos`.
- Navbar `Produtos` points to `/produtos`.
- `/produtos` is a dedicated full catalog page with filters, cart actions, and product-detail modal.
- PB branding is served directly from `/brand/pb.png` and was manually accepted on the affected Android phone.
- Product production/posting copy is up to 5 business days.

Current product prices:

- Deck Commander Proxy 100 Cartas: R$ 150,00 original / R$ 119,90 sale.
- Deck Proxy 60 Cartas: R$ 99,99 original / R$ 69,99 sale.
- Trusted checkout price for product ID `2` remains R$ 69,99.

## Checkout / payment / freight / admin — PRODUCTION ACCEPTED

Validated end to end in Production before merge:

- Mercado Pago Checkout Pro preference creation;
- one legitimate controlled low-value real payment;
- signed Mercado Pago webhook accepted with HTTP `200`;
- payment fetched from Mercado Pago before the atomic Supabase state transition;
- accepted order moved `pending` -> `approved`, detail `accredited`;
- public order page returned HTTP `200`;
- webhook selector uses `source_news=webhooks`;
- temporary validation product/route was removed afterward;
- Melhor Envio Production OAuth active;
- Production freight restricted to Correios PAC/SEDEX service IDs `1/2`;
- Admin login uses password + mandatory Authenticator TOTP/AAL2;
- one active app session with strict 30-minute inactivity timeout;
- auth/session/storage failures fail closed.

No additional real Mercado Pago payment is required solely because of the storefront/presentation merge; checkout/payment/freight logic and trusted prices were already Production-accepted.

## Applied Supabase migrations

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`
7. `202608310001_admin_sessions.sql`

## Historical debugging decisions future sessions must not rediscover

- Vercel Hobby temporarily blocked Preview builds with `build-rate-limit`; an empty commit successfully retriggered Preview after the limit reset.
- Android Termux itself was not the core Next.js build issue: Android ARM64 lacks the matching native Next/SWC binary for Next 16.3.3.
- Termux production compilation was proven possible using `@next/swc-wasm-nodejs@16.3.3`, `NEXT_TEST_WASM_DIR`, and `next build --webpack`; ordinary `pnpm test` and `pnpm typecheck` also passed there.
- The first PB implementation embedded a raster inside SVG and rendered broken on the affected Android browser; the accepted fix is the direct PNG route `/brand/pb.png`.

## Next safe actions

1. Owner reviews `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md` on `feat/admin-dashboard-expansion`.
2. If the owner approves the written spec, invoke the planning workflow and create `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` with detailed dependency-aware phases, checkboxes, TDD evidence fields, Preview gates, rollback steps, and exact continuation checkpoints.
3. Do not implement the expansion before that planning gate.
4. Do not merge the new branch or deploy this expansion to Production without explicit owner approval at the appropriate later gate.
5. Treat any hosting migration as a separate risk-isolated project.
6. Do not delete the historical `feat/checkout-mercadopago` branch unless the owner explicitly requests repository cleanup.

## End-of-session rule

Every meaningful session must update this file with passed/failed evidence, blockers, exact next action, relevant deployment/merge evidence, and decisions future sessions must not rediscover.

**Resume point:** The existing checkout/storefront/admin-auth baseline remains Production-accepted on `main`. New work is isolated on `feat/admin-dashboard-expansion`. The complete architectural design for Admin Dashboard + Customer Account expansion is committed at `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md` in commit `325922ffe3eec7440d86cbf86d062aaef8a6ab03`. No implementation has started. The owner must review/approve the written spec next; only after that approval should `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` be created and implementation planning proceed.