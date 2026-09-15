# Phase 9 — Final manual smoke

**Date created:** 2026-09-15  
**Accepted:** 2026-09-15  
**Branch:** `feat/phase-9-hardening-final-rollout`  
**Production runtime SHA:** `cdb3f863336237ab49f9b91cca20f0d876aa75c7`

This is the single manual acceptance checklist for the remaining historical debt plus the final Phase 9 rollout. Automated evidence and owner-observed evidence are deliberately separate. A CI-green build or public HTTP 200 does not convert an authenticated/manual row into accepted evidence.

On 2026-09-15 the owner reported completion of the full manual checklist below with the result **“tudo ok”** after receiving the complete checklist in one pass. The acceptance recorded here is therefore **owner-reported Production observation**, not an inference from CI.

## Automated prerequisites already covered

These suites reduce the manual smoke to user-visible integration proof; they do not replace it:

- `tests/admin-product-routes.test.ts`
- `tests/admin-product-images.test.ts`
- `tests/admin-product-editor-ui.test.ts`
- `tests/admin-dashboard-ui.test.ts`
- `tests/admin-dashboard-repository.test.ts`
- `tests/private-order-only.test.ts`
- `tests/customer-account-actions.test.ts`
- `tests/checkout-route.test.ts`
- `tests/admin-store-settings-routes.test.ts`
- `tests/admin-store-settings-ui.test.ts`
- `tests/admin-shipment-actions.test.ts`
- `tests/shipment-no-auto-spend.test.ts`
- `tests/notification-worker.test.ts`
- `tests/phase9-security-inventory.test.ts`
- `tests/phase9-route-security.test.ts`
- `tests/phase9-supabase-hardening.test.ts`
- `tests/phase9-concurrency-contract.test.ts`

## A. Phase 4 product-admin historical debt

**Status: OWNER ACCEPTED / PRODUCTION OBSERVED**

The owner reported all of the following as passing on Production:

- [x] Create a draft product in the protected admin.
- [x] Edit title/content/pricing/shipping-safe fields and confirm the save is reflected after reload.
- [x] Publish the draft and confirm it becomes visible in the public catalog/product surface.
- [x] Archive it and confirm it is removed from the public catalog.
- [x] Reactivate it according to the accepted lifecycle contract and confirm it returns as a draft before any republish.
- [x] Upload/replace a product image through the protected image flow and confirm it renders correctly.
- [x] Open the same product in two tabs, save in tab A, then attempt a stale save from tab B; confirm the stale edit is rejected as a conflict and does not overwrite A.
- [x] Confirm catalog/cache propagation after publish/archive/reactivate without requiring a server restart.

Result: **PASS — owner-reported on 2026-09-15**.

## B. Phase 8 authenticated dashboard debt

**Status: OWNER ACCEPTED / PRODUCTION ACCEPTED**

The owner reported all of the following as passing on Production:

- [x] Sign in to `/admin` with the normal admin MFA/session flow.
- [x] Dashboard loads without `Não foi possível carregar os indicadores agora` and without substituting failed data with synthetic zeros.
- [x] `Pedidos`, `Aprovado bruto` and `Revertido` period cards render with plausible current values.
- [x] Current fulfillment queues render: awaiting production, in production, ready to ship and shipped.
- [x] Current financial-risk counts render: manual review, refunded and chargeback.
- [x] `Requer atenção` shows severity totals and top open items when present.
- [x] Clicking an attention item opens the correct order.
- [x] `Ver todos` reaches `/admin/pedidos?attention=1` and the filtered order list works.
- [x] No raw attention metadata/JSON/internal payload is rendered to the browser.
- [x] Monthly product-sales ranking renders.
- [x] Melhor Envio utility remains accessible from the dashboard.
- [x] Authenticated/private response caching behavior is not publicly cacheable.

Result: **PASS — owner-reported on 2026-09-15**. Phase 8 may now be recorded as **Production accepted**.

## C. Final Phase 9 Production smoke

**Status: OWNER ACCEPTED / PRODUCTION ACCEPTED / FINAL CANDIDATE DEPLOYED**

The exact final runtime candidate was deployed to KingHost and restarted through the KingHost panel before this smoke. The owner then reported all of the following as passing:

- [x] Public home/catalog responds normally over HTTPS.
- [x] Customer sign-in works and a customer can view only their own private order surfaces.
- [x] A direct attempt to access another customer's order does not disclose the order.
- [x] Checkout starts only for a verified authenticated customer and uses the expected server-authoritative totals/shipping path.
- [x] Admin login still requires the accepted MFA/AAL2 + active app-session boundary.
- [x] Store Settings loads and saves; a stale two-tab save produces a conflict instead of silently overwriting.
- [x] A safe Store Settings value visibly propagates to its public consumer without server restart and is restored after smoke.
- [x] Shipping remains non-spending by default with `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false`; no label purchase was required solely for smoke.
- [x] Existing shipment/order admin page loads and safe non-spending actions remain available.
- [x] Transactional notification admin/worker path remains reachable under its intended authority without generating customer spam solely for smoke.
- [x] Protected admin/customer pages do not expose raw secrets, service-role credentials or internal provider payloads.
- [x] Public site health remains HTTP 200 after restart.

Result: **PASS — owner-reported on 2026-09-15**. Phase 9 may now be recorded as **Production accepted**.

## D. Production terminal/public checks

These operator checks were completed before the authenticated acceptance above.

**Observed 2026-09-15 from owner-provided KingHost terminal output:**

- deployed runtime SHA: `cdb3f863336237ab49f9b91cca20f0d876aa75c7`;
- restart: owner reported completion through the KingHost panel;
- `git rev-parse HEAD`: exact candidate SHA above;
- first post-build `git status -sb`: detached HEAD plus only `M next-env.d.ts`;
- `git diff -- next-env.d.ts` showed only Next.js-generated type-reference changes from `.next/dev/types/routes.d.ts` to `.next/types/routes.d.ts` plus `.next/types/root-params.d.ts`;
- after `git restore next-env.d.ts`, `git status -sb` returned only `## HEAD (no branch)` with no modified files;
- `curl -sSI https://www.proxybembem.com.br/ | head -n 10` returned `HTTP/2 200` and the expected security headers including CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS.

The Production checkout remains intentionally detached at the exact runtime candidate SHA. Commits after that candidate in this branch are acceptance/tests/documentation only unless explicitly stated otherwise.

## Acceptance recording rule

Manual acceptance must never be inferred from automated tests, database queries or public HTTP health alone. This file changed to accepted only after the owner explicitly reported completion of the full manual checklist.

With Sections A/B/C accepted, the Phase 4 historical smoke debt is closed, Phase 8 is Production accepted, and Phase 9 is **implementation complete / hosted validated / final candidate deployed / Production accepted**.
