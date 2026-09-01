# ProxyBembem Checkout — Current Status

**Updated:** 2026-09-01

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

## Storefront architecture — DEDICATED PRODUCTS PAGE RESTORED, PREVIEW-ONLY

Historical context: on 2026-08-31 the owner approved consolidating the complete catalog into Home. That implementation made Home the full storefront, pointed the navbar `Produtos` item to `/#produtos`, and changed `/produtos` into a redirect. The owner later reversed that product decision and requested the original separate-products-page architecture back.

Current approved behavior:

- Home keeps the newer hero/copy but shows only `featuredProducts` in the product preview;
- hero `Ver produtos` points to `/produtos`;
- Home also has `Ver Todos os Produtos` pointing to `/produtos`;
- navbar `Produtos` points to `/produtos` and becomes active on the dedicated route;
- `/produtos` renders `ProductsPage` again instead of redirecting Home;
- `ProductsPage` retains its category filters, full product list, cart actions and product-detail modal;
- 60-card deck remains R$ 99,99 original / R$ 69,99 sale;
- Commander remains R$ 150,00 original / R$ 119,90 sale;
- trusted checkout price for product ID `2` remains R$ 69,99;
- checkout/payment/freight code was not changed by this architecture reversal.

Relevant history and TDD evidence:

- former consolidation implementation: `db413273...`, `7edb873...`, `b9af679...`;
- restoration RED contract: `d3e19b3e069f1d976d2f68eada36a18356d717e8`;
- RED CI `#729`: 225 tests total, 222 passed and exactly three expected failures (Home still full catalog, navbar still hash-linked, `/produtos` still redirecting); the existing dedicated `ProductsPage` integrity check already passed;
- Home restoration: `ef9f666c40d8f7ec00f9544f5bfa7d286b8009da`;
- navbar restoration: `fad13824e536179f48f58cf3defb283d29f80d85`;
- `/produtos` route restoration: `896408b68de8e846bec93b13bc13bec7c615cdbb`;
- GREEN CI `#735`: `pnpm test`, `pnpm typecheck` and `pnpm build` all passed.

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

Latest previously verified functional Preview for code commit `6be47614c719c95e161796855803eb0c208e179e`:

- deployment `dpl_5PMwYjf2Qsp5Sw5rrRh1qLKqRgzC`;
- URL `proxybembem-3feijc8yp-brenobembemm1802-7300s-projects.vercel.app`;
- state `READY`, target Preview (`null`), not Production;
- `/brand/pb.png` returns HTTP `200`, `Content-Type: image/png`, immutable cache policy;
- `/` returns HTTP `200`;
- navbar and footer render `src="/brand/pb.png"`;
- metadata renders both favicon and Apple touch icon as `/brand/pb.png`.

Manual phone rendering is still the final acceptance step for this particular regression. Do not claim the visual bug is proven fixed until the owner opens a current Preview on the affected phone and confirms the PB appears correctly.

Production remains untouched by this fix and by the dedicated-products-page restoration.

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

## PR / integration state

PR `#2` remains open and unmerged. The branch contains the Production-accepted checkout stack plus Preview-only dedicated-products-page restoration, modal refresh, five-business-day production copy and PB branding.

Next safe steps:

1. Wait for CI/Preview on this documentation checkpoint HEAD.
2. Owner opens the newest Preview and confirms Home shows only featured products, the hero/menu CTAs open `/produtos`, and `/produtos` renders the full filtered catalog.
3. On the same Android/browser that showed the broken image, confirm the PB renders correctly.
4. If visually accepted, ask for explicit owner approval before any Production promotion of the presentation bundle.
5. After future Production promotion, verify canonical-domain Home, `/produtos`, current prices, hero/menu links, PB header/footer/favicon, five-day copy and no runtime error cluster.
6. Do **not** merge to `main` without explicit owner approval.
7. Begin KingHost migration only after branch finalization as a separate risk-isolated phase.

No new real Mercado Pago payment is required for these presentation/copy/branding changes because payment/freight processing code and trusted sale prices were not changed.

## End-of-session rule

Every meaningful session must update this file with passed/failed evidence, blockers, exact next action, relevant HEAD/deployment evidence and decisions future sessions must not rediscover.

**Resume point:** checkout/payment/freight/Admin Production acceptance is complete. The owner reversed the Home/catalog consolidation decision: Home is now featured-only again and `/produtos` is a dedicated full catalog page. Restoration is GREEN in CI `#735` through `896408b...`; documentation is the next HEAD checkpoint. Presentation work remains Preview-only. Manual current-Preview checks are still required for the restored navigation/catalog flow and for the PB on the affected Android browser. Never merge `main` without explicit owner approval.

## 2026-09-01 presentation production promotion — COMPLETE

This section supersedes the older `Preview-only`, `manual phone confirmation pending`, and `Production remains untouched` statements above for the presentation bundle. Those statements are retained only as historical evidence.

Promotion evidence:

- owner visually approved the current Preview on the affected Android phone;
- approved Preview deployment: `dpl_Fi7y1xejJKZqjEMx4cVZhgRXuEma`;
- approved Preview commit: `a702cf31a8e263781fbebf3c0593f2367e119ef1` (`chore: retrigger vercel preview`), an empty commit used only to retrigger Vercel after the Hobby build-rate limit reset;
- CI `#740` completed successfully on that SHA with `pnpm test`, `pnpm typecheck`, and `pnpm build` all passing;
- Production promotion deployment: `dpl_71TXqkwdGrR5ZkuLhaJETr14grho`;
- Production deployment metadata records `action=promote` and `originalDeploymentId=dpl_Fi7y1xejJKZqjEMx4cVZhgRXuEma`, confirming promotion from the approved Preview;
- Production state is `READY`, target `production`, with aliases including `www.proxybembem.com.br`, `proxybembem.com.br`, and `proxybembem.vercel.app`;
- canonical `https://www.proxybembem.com.br/` returned HTTP `200` after promotion with the newer `Monte seu deck do seu jeito` hero, featured-only Home catalog, `/produtos` navigation, and `/brand/pb.png` branding;
- canonical `https://www.proxybembem.com.br/produtos` returned HTTP `200`, rendered `ProductsPage`, showed both current products and the current prices (Commander R$ 119,90; 60-card deck R$ 69,99);
- immediate post-promotion Production runtime query for `error`/`fatal` logs on the promoted deployment returned no matching logs;
- checkout/payment/freight/Admin code was not changed as part of this presentation promotion and no new real Mercado Pago payment was required.

Current integration state:

- PR `#2` is still open and unmerged;
- `main` was not merged or moved;
- the presentation bundle is now Production-accepted, not Preview-only;
- the PB direct-PNG fix is now manually confirmed on the affected phone and live in Production;
- the dedicated `/produtos` architecture is live in Production.

Next safe actions:

1. Monitor Production for regressions/runtime errors during ordinary traffic.
2. Keep PR `#2` open until the owner explicitly decides to merge it.
3. Do **not** merge `main` without explicit owner approval.
4. Treat any future hosting migration (KingHost/Render/Railway/self-hosting) as a separate risk-isolated project.

**Latest resume point:** checkout/payment/freight/Admin and the newer presentation bundle are now both accepted in Production. Production deployment `dpl_71TXqkwdGrR5ZkuLhaJETr14grho` is `READY` and was promoted from the owner-approved Preview `dpl_Fi7y1xejJKZqjEMx4cVZhgRXuEma` on SHA `a702cf31...`, with CI `#740` green. Canonical Home and `/produtos` both returned HTTP `200`, the dedicated Products page is live, PB PNG branding is live and phone-confirmed, and no immediate Production error/fatal logs were observed. PR `#2` remains open/unmerged; never merge `main` without explicit owner approval.
