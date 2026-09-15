# Phase 9 — Final manual smoke

**Date created:** 2026-09-15  
**Branch:** `feat/phase-9-hardening-final-rollout`

This is the single manual acceptance checklist for the remaining historical debt plus the final Phase 9 rollout. Automated evidence and owner-observed evidence are deliberately separate. A CI-green build or public HTTP 200 does not convert an authenticated/manual row into accepted evidence.

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

**Status: PENDING OWNER SMOKE**

Use a disposable/test product, not a live product relied upon by customers.

- [ ] Create a draft product in the protected admin.
- [ ] Edit title/content/pricing/shipping-safe fields and confirm the save is reflected after reload.
- [ ] Publish the draft and confirm it becomes visible in the public catalog/product surface.
- [ ] Archive it and confirm it is removed from the public catalog.
- [ ] Reactivate it according to the accepted lifecycle contract and confirm it returns as a draft before any republish.
- [ ] Upload/replace a product image through the protected image flow and confirm it renders correctly.
- [ ] Open the same product in two tabs, save in tab A, then attempt a stale save from tab B; confirm the stale edit is rejected as a conflict and does not overwrite A.
- [ ] Confirm catalog/cache propagation after publish/archive/reactivate without requiring a server restart.

Record date, deployed SHA and concise observed result before changing this section to accepted.

## B. Phase 8 authenticated dashboard debt

**Status: PENDING OWNER SMOKE**

The Phase 8 candidate was implemented, hosted DB validation was completed and its candidate was deployed, but the authenticated `/admin` browser smoke was explicitly deferred by the owner. Keep this pending until it is actually observed.

- [ ] Sign in to `/admin` with the normal admin MFA/session flow.
- [ ] Dashboard loads without `Não foi possível carregar os indicadores agora` and without substituting failed data with synthetic zeros.
- [ ] `Pedidos`, `Aprovado bruto` and `Revertido` period cards render with plausible current values.
- [ ] Current fulfillment queues render: awaiting production, in production, ready to ship and shipped.
- [ ] Current financial-risk counts render: manual review, refunded and chargeback.
- [ ] `Requer atenção` shows severity totals and top open items when present.
- [ ] Clicking an attention item opens the correct order.
- [ ] `Ver todos` reaches `/admin/pedidos?attention=1` and the filtered order list works.
- [ ] No raw attention metadata/JSON/internal payload is rendered to the browser.
- [ ] Monthly product-sales ranking renders.
- [ ] Melhor Envio utility remains accessible from the dashboard.
- [ ] Observe authenticated/private response caching behavior in browser/network tooling and confirm the protected response is not publicly cacheable.

Record date, deployed SHA and concise observed result before marking Phase 8 Production accepted.

## C. Final Phase 9 Production smoke

**Status: PENDING OWNER SMOKE / WAITING FINAL CANDIDATE DEPLOY**

Run only after the exact final CI-green Phase 9 candidate has been deployed to KingHost and restarted through the KingHost panel.

- [ ] Public home/catalog responds normally over HTTPS.
- [ ] Customer sign-in works and a customer can view only their own private order surfaces.
- [ ] A direct attempt to access another customer's order does not disclose the order.
- [ ] Checkout starts only for a verified authenticated customer and uses the expected server-authoritative totals/shipping path.
- [ ] Admin login still requires the accepted MFA/AAL2 + active app-session boundary.
- [ ] Store Settings loads and saves; a stale two-tab save produces a conflict instead of silently overwriting.
- [ ] A safe Store Settings value visibly propagates to its public consumer without server restart, then is restored if changed only for smoke.
- [ ] Shipping remains non-spending by default with `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false`; do not deliberately purchase a label solely for smoke.
- [ ] Existing shipment/order admin page loads and safe non-spending actions remain available.
- [ ] Transactional notification admin/worker path remains reachable under its intended authority; do not generate customer spam solely to prove the route.
- [ ] Protected admin/customer pages do not expose raw secrets, service-role credentials or internal provider payloads.
- [ ] Public site health remains HTTP 200 after restart.

## D. Production terminal/public checks

These are operator checks, not substitutes for the authenticated browser rows above.

After deploy/restart:

```bash
cd ~/apps_nodejs/proxybembem
git rev-parse HEAD
git status -sb
curl -sSI https://www.proxybembem.com.br/ | head -n 10
```

Required:
- exact expected candidate SHA;
- no unexplained local modifications;
- public HTTPS success;
- restart performed only through the KingHost panel, never PM2 CLI.

## Acceptance recording rule

Do not edit `PENDING OWNER SMOKE` to accepted based on automated tests, database queries, screenshots not actually observed by the owner, or assumptions from a previous phase. When the owner performs the smoke, record only what was actually observed in the final acceptance evidence.

Until sections A/B/C have the required owner evidence, Phase 9 may be described as **implementation/automated hardening complete** after all automated/hosted gates pass, but the project must not be described as fully Production accepted.
