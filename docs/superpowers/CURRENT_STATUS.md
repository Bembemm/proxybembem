# ProxyBembem Checkout — Current Status

**Updated:** 2026-08-31

This is the canonical continuation checkpoint. Read this file before older plan checkboxes.

## Repository / safety constraints

- Repo: `Bembemm/proxybembem`
- Active branch: `feat/checkout-mercadopago`
- PR `#2`: `feat: adicionar checkout seguro com Mercado Pago`, base `main`, open and unmerged.
- Never merge `main` without explicit owner approval.
- Never expose provider, Supabase, password, TOTP or other secret values in chat, screenshots, logs, docs or commits.
- Storefront/branding presentation changes remain Preview-only until the owner explicitly approves Production promotion.
- KingHost migration remains deferred until this branch is finalized.

## Production checkout/payment/freight/admin rollout — COMPLETE

The checkout stack was validated end to end on `https://www.proxybembem.com.br` before the newer storefront presentation changes.

Validated in Production:

- Admin login with password + mandatory Authenticator TOTP/AAL2;
- one active app session with strict 30-minute server/DB inactivity timeout;
- Melhor Envio Production OAuth active;
- Production freight restricted to Correios PAC/SEDEX service IDs `1/2`;
- Mercado Pago Production preference creation;
- one legitimate controlled low-value real payment;
- signed Mercado Pago Webhook accepted with HTTP `200`;
- payment fetched from Mercado Pago before atomic Supabase state transition;
- accepted order moved `pending` → `approved`, detail `accredited`;
- public order page returned HTTP `200`;
- temporary R$ 5 validation item/route was removed afterward;
- Webhooks-only selector cleanup (`source_news=webhooks`) was promoted and verified.

Final accepted cleanup Production baseline before newer presentation work:

- deployment `dpl_3cywxYxepJpAJCWnZ6jLQzQFb7Xb`;
- commit `f31925a5ab3cbba02f7a5fba572318b2dcccac8b`;
- target `production`, state `READY`;
- aliases include `www.proxybembem.com.br` and `proxybembem.com.br`.

Do not confuse this live baseline with the Preview-only presentation work below.

## Storefront consolidation — PREVIEW VALIDATED, NOT YET PRODUCTION

Approved behavior:

- home is the main storefront and renders the complete trusted catalog;
- hero points to `#produtos`;
- navbar `Produtos` points to `/#produtos`;
- legacy `/produtos` redirects to the home catalog;
- 60-card deck displays R$ 99,99 original / R$ 69,99 sale / -30% / R$ 30,00 savings;
- Commander displays R$ 150,00 / R$ 119,90 / -20% / R$ 30,10 savings;
- trusted checkout price for product ID `2` remains R$ 69,99.

TDD baseline:

- RED `3e748b94...`, CI `#670` expected failures;
- implementation `e7d66cbe...`, `db413273...`, `7edb873...`, `b9af679...`;
- GREEN CI `#678` passed tests, typecheck and build.

## Product-detail modal refresh + five-business-day window — PREVIEW VALIDATED

Both products now use buyer-first copy and calmer detail sections:

- quick highlights;
- `O QUE VOCÊ RECEBE`, `QUALIDADE`, `VERSO`, `COMO ESCOLHER AS CARTAS`, `ARTES`;
- photographic paper + lamination;
- white back + opaque-sleeve recommendation;
- separate non-official proxy / sanctioned tournament disclosure;
- production quick highlight says `Produção em até 5 dias úteis`;
- `PRAZO` says `Produção e postagem em até 5 dias úteis.`;
- FAQ says `Após a confirmação do pagamento, o prazo de produção é de até 5 dias úteis.`;
- stale `pagamento via Pix` and `1 a 3 dias úteis` FAQ wording was removed.

Relevant evidence:

- modal RED `29dc4a4c...`, GREEN CI `#688`;
- five-day/PB RED contracts `034bbf89...` and `88d84c65...`;
- five-day product implementation `e21e966792252b6bb7d964e53a50827cd198c49c`;
- FAQ implementation `d86a024090a0028d4a26903dad12b20fbe28f8cb`.

## PB branding mobile regression — FIXED IN PREVIEW, MANUAL PHONE CONFIRMATION PENDING

The first PB implementation (`6e7838b468f02f885f66b7870d561d9d913e575b`) embedded a WebP raster as a `data:image/webp;base64,...` image inside `public/icon.svg`. Vercel/server fetches returned HTTP `200`, but the owner supplied a real Android browser screenshot showing the navbar image as a broken-image placeholder. This demonstrated that server availability alone was not sufficient browser-compatibility evidence.

Root-cause conclusion for the bounded fix: avoid the nested raster-inside-SVG construction and serve the supplied PB artwork as an ordinary PNG response.

TDD / debugging evidence:

- RED commit `3aaa50cbbd3427ea8ebd093f5d0db0f1e246a823` (`test: reproduce broken PB image on mobile`);
- RED CI `#706`: 223 tests total, 222 passed and exactly one expected failure because `app/brand/pb.png/route.ts` did not yet exist;
- direct PNG route finalized in `87ed8960473c67d50c04ff736c720256d95b498a`;
- navbar switched to `/brand/pb.png` in `59bd0bb603a9f9aa87a17d6c11b918def71ee35e`;
- footer switched to `/brand/pb.png` in `e9fca1b1b2b4d847848f8a8bbef64f8dc3353824`;
- favicon + Apple touch icon switched to `/brand/pb.png` in `6be47614c719c95e161796855803eb0c208e179e`;
- GREEN CI `#716`: `pnpm test`, `pnpm typecheck` and `pnpm build` all passed.

Latest functional Preview for code commit `6be47614c719c95e161796855803eb0c208e179e`:

- deployment `dpl_5PMwYjf2Qsp5Sw5rrRh1qLKqRgzC`;
- URL `proxybembem-3feijc8yp-brenobembemm1802-7300s-projects.vercel.app`;
- state `READY`, target Preview (`null`), not Production;
- `/brand/pb.png` returns HTTP `200`, `Content-Type: image/png`, immutable cache policy;
- `/` returns HTTP `200`;
- navbar and footer render `src="/brand/pb.png"`;
- metadata renders both favicon and Apple touch icon as `/brand/pb.png`.

Manual phone rendering is still the final acceptance step for this particular regression. Do not claim the visual bug is proven fixed until the owner opens this exact Preview on the affected phone and confirms the PB appears correctly.

Production remains untouched by this fix.

## Admin Auth — COMPLETE

Security model remains unchanged:

- one manually provisioned admin;
- public signup disabled;
- immutable Supabase UUID authorization via server-only `ADMIN_USER_ID`;
- email/password + mandatory TOTP Authenticator;
- AAL2 required;
- no SMS/trusted-device bypass;
- one active app session;
- strict 30-minute inactivity timeout;
- revoked/expired sessions cannot regain access;
- auth/session/storage failures fail closed;
- Melhor Envio OAuth start requires valid AAL2 admin access.

## Applied Supabase migrations

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`
7. `202608310001_admin_sessions.sql`

## Hero `Ver produtos` shortcut — RESTORED, GREEN, PREVIEW-ONLY

The hero shortcut was temporarily removed in `c8cfa6c52039cb18c2678bfcfe85577e40fd06a1`, but the owner reversed that presentation decision and explicitly requested it back. The navbar `Produtos` entry was never removed.

TDD evidence for the restoration:

- RED contract commit `77561f5b35ee2e5b27066e7411b75685ffed3901`;
- RED CI `#723`: 225 tests total, 224 passed and exactly one expected failure because the home hero lacked `href="#produtos"` / `Ver produtos`;
- implementation `6304a68efebdd5f52b0742d7eb5123686197ff5e` restores the original hero button and `next/link` import;
- GREEN CI `#725`: `pnpm test`, `pnpm typecheck` and `pnpm build` all passed;
- checkout/payment/freight code was not changed by this presentation reversal.

## PR / integration state

PR `#2` remains open and unmerged. The branch contains the Production-accepted checkout stack plus Preview-only storefront consolidation, modal refresh, five-business-day production copy, PB branding and the restored hero `Ver produtos` shortcut.

Next safe steps:

1. Wait for CI/Preview on this documentation checkpoint HEAD.
2. Owner opens the newest Preview on the same Android/browser that showed the broken image and confirms the PB renders.
3. If visually accepted, ask for explicit owner approval before any Production promotion of the presentation bundle.
4. After future Production promotion, verify canonical-domain home, prices, `/produtos` redirect, hero `Ver produtos`, PB header/footer/favicon, five-day copy and no runtime error cluster.
5. Do **not** merge to `main` without explicit owner approval.
6. Begin KingHost migration only after branch finalization as a separate risk-isolated phase.

No new real Mercado Pago payment is required for these presentation/copy/branding changes because payment/freight processing code and trusted sale prices were not changed.

## End-of-session rule

Every meaningful session must update this file with passed/failed evidence, blockers, exact next action, relevant HEAD/deployment evidence and decisions future sessions must not rediscover.

**Resume point:** checkout/payment/freight/Admin Production acceptance is complete. New storefront/modal/five-day/PB work remains Preview-only. The hero `Ver produtos` shortcut was restored by owner decision in `6304a68...` and is GREEN in CI `#725`; the navbar `Produtos` entry was never removed. The nested WebP-inside-SVG PB method failed on the owner's Android browser and has been replaced by a direct PNG response. Manual PB confirmation on the affected phone remains pending, followed by explicit Production approval if accepted. Never merge `main` without explicit owner approval.
