# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then the active phase plan before making changes.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`
- Phase 2 plan: `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`
- Active Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- State: **PHASE 1 APPLIED/VERIFIED; PHASE 2 COMPLETE/VERIFIED/PREVIEW ACCEPTED; PHASE 3 PLAN WRITTEN/REVIEWED; RUNTIME NOT STARTED**
- Merge/new Production application deployment: **NOT APPROVED**

## Phase 1 verified baseline

Phase 1 database foundation is applied to the existing Supabase project `ProxyBembem` (`kicgoocozxzkuoqajqif`) after explicit owner authorization.

Verified: 25 existing orders were backfilled truthfully, no fabricated events were added, `order_events`/attention/audit are browser-isolated, payment approval/replay/refund/chargeback/manual-review were transaction-tested, zero validation fixtures remained, and Production `/admin` remained healthy after the additive migration.

Owner workflow decision remains: evolve the existing Supabase project as schema is needed. No paid Supabase development branch is required. Meaningful DDL still requires explicit owner approval before application.

## Phase 2 — COMPLETE

Final reviewed runtime candidate:

`abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`

Freshly re-verified CI `33650730746`, job `100316764581`:

- `pnpm test`: PASS;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS;
- workflow conclusion: SUCCESS.

Phase 2 provides the protected admin order list/detail/production queues, narrow same-origin/AAL2 fulfillment actions, atomic DB transitions/event/audit/attention behavior, destructive cancellation confirmation, and provider-authoritative payment separation.

Applied migration after explicit owner approval:

`20260902160658_admin_order_fulfillment_operations`

Controlled rollback validation passed **16/16** and left:

```text
orders: 0
events: 0
attention: 0
audit: 0
```

Preview acceptance passed. Owner authenticated normally with existing password + TOTP and verified **5/5** protected surfaces: `/admin`, `/admin/pedidos`, one real order detail read-only, `/admin/producao`, and `/admin/integrations/melhor-envio`. Deployment-scoped logs after the smoke had no `error`/`fatal` entries. Phase 2 is complete but **not merged and not promoted to a new Production application deployment**.

## Phase 3 approved decisions

Owner explicitly decided on 2026-09-02:

**Email is mandatory at checkout for every new order, including guest checkout.**

This resolves the previous architecture blocker. The implementation plan locks the following consequences:

1. Guest checkout remains supported; account creation is still optional.
2. New orders store a normalized lowercase email snapshot (`customer_email`).
3. Existing historical orders do **not** receive fabricated email values; `customer_email` stays `NULL` for old orders unless future truth is established explicitly.
4. Authenticated checkout links the order to the trusted Supabase Auth UUID (`customer_id`) resolved server-side. Browser JSON never supplies a trusted customer UUID.
5. For authenticated checkout, the persisted email is the canonical authenticated account email; a mismatching form email is rejected.
6. Supabase Auth email is the unique account identity; permanent `customer_profiles` stores only minimal profile data such as name/WhatsApp, not payment data.
7. Customer authorization is separate from admin authorization; a normal customer session never grants admin access.
8. Customer order reads use narrow safe RPCs deriving ownership from `auth.uid()`; there is no broad browser SELECT on `orders`.
9. Guest-order claiming requires **verified account email + possession of the existing 64-character public order token**. Email-only, name-only, WhatsApp-only, order-number-only and bulk automatic claiming are forbidden.
10. Historical orders with `customer_email IS NULL` remain public-token-trackable but are not claimable in Phase 3.
11. Existing `/pedido/[token]` tracking remains valid even after an order is linked to an account.
12. Customer DTOs exclude public token, checkout attempt/fingerprint/URL, raw shipping snapshot, admin audit, provider credentials and other internals.
13. Mercado Pago remains payment authority; account code does not mutate financial state.
14. Phase 3 uses Supabase Auth verification/recovery emails only. Transactional order-status emails remain Phase 6.

## Phase 3 plan

Plan created:

`docs/superpowers/plans/2026-09-02-customer-account-orders.md`

Initial planning commit:

`f36350f861e4dc8c3b8206f38a75e5bc4350b8f8`

The plan was self-reviewed for spec coverage, placeholder patterns and type/interface consistency. No `TODO`, `TBD`, `implement later`, or `Similar to` placeholders remain.

Planned Phase 3 sequence:

1. migration contract RED;
2. additive customer/account migration GREEN in Git only;
3. required checkout email RED/GREEN;
4. trusted customer auth boundary;
5. authenticated checkout ownership persistence;
6. RLS-backed minimal customer profile repository;
7. signup/login/logout/verification/password recovery/profile actions + rate limits;
8. customer-owned order list/detail RPC wrappers;
9. verified-email + public-token guest claiming;
10. storefront-styled `/minha-conta` UI;
11. customer A/B isolation and takeover security matrix;
12. full candidate test/typecheck/build + exact diff/security review;
13. explicit owner gate before applying Phase 3 DDL to current Supabase;
14. Preview acceptance;
15. Phase 3 completion gate.

## Phase 3 database intent — NOT APPLIED

Planned repository migration filename:

`supabase/migrations/202609020003_customer_accounts_orders.sql`

It does **not exist yet** and no Phase 3 DDL has been applied to Supabase.

Planned schema includes nullable `orders.customer_email`, nullable `orders.customer_id -> auth.users(id)`, minimal `customer_profiles`, authenticated safe list/detail RPCs using `auth.uid()`, and a service-role-only atomic guest-claim RPC. Historical rows are not backfilled with fabricated ownership/email.

## Current safety gates

- Do not merge `feat/admin-dashboard-expansion` without explicit owner approval.
- Do not promote/create a new Production application deployment without explicit owner approval.
- Do not delete the feature branch unless owner explicitly requests it.
- Phase 2 migration is already applied; do not rediscover or reapply it.
- Phase 3 DDL is **not approved/applied yet**. Build/test the full candidate first, then stop for explicit owner approval before current-project migration application.
- Do not start Phase 4 catalog runtime work before Phase 3 completion.

## Resume point

**Phase 2:** COMPLETE/VERIFIED/PREVIEW ACCEPTED.

**Phase 3:** implementation plan WRITTEN/SELF-REVIEWED; runtime implementation NOT STARTED.

**Approved checkout-email rule:** required for all new guest/authenticated checkouts.

**NEXT EXACT ACTION:** execute Phase 3 Task 1 only: create `tests/customer-account-migration.test.ts`, run `node --experimental-strip-types --test tests/customer-account-migration.test.ts`, capture the expected RED because `supabase/migrations/202609020003_customer_accounts_orders.sql` does not exist, record RED evidence, and only then write the migration. No Supabase application, merge, or Production promotion at this step.
