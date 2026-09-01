# ProxyBembem Checkout — Current Status

**Updated:** 2026-09-01

This is the canonical continuation checkpoint. Read this file before older plan checkboxes.

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
- accepted order moved `pending` → `approved`, detail `accredited`;
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

1. Monitor Production for ordinary runtime regressions/errors.
2. Treat any hosting migration (KingHost/Render/Railway/self-hosting) as a separate risk-isolated project; no hosting migration is currently required for the merged checkout/storefront work.
3. Do not delete the historical feature branch unless the owner explicitly wants repository cleanup.
4. For future feature work, branch from current `main`, use TDD/CI, validate Preview when appropriate, and obtain explicit approval before risky Production changes.

## End-of-session rule

Every meaningful session must update this file with passed/failed evidence, blockers, exact next action, relevant deployment/merge evidence, and decisions future sessions must not rediscover.

**Resume point:** PR `#2` is merged into `main`; merge commit `1f0bff2c88901a5e0bd0c910e3f650264bceb79b` passed CI `#743`; the merge-triggered Vercel Production deployment `dpl_8AZsHDWCtGmSv1rvCDeVjwJfy7qt` is `READY`; the dedicated `/produtos` storefront, PB PNG branding, five-business-day copy, checkout/payment/freight stack, and Admin auth are Production-accepted. Future work should start from `main` and keep hosting migration separate.