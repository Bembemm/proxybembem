# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then the active phase plan before making changes.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`
- Active Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- State: **PHASE 1 COMPLETE/APPLIED; PHASE 2 COMPLETE/APPLIED/PREVIEW ACCEPTED; PHASE 3 TASK 1 RED VALID; TASK 2 GREEN MIGRATION NEXT**
- Merge/new Production application deployment: **NOT APPROVED**

## Verified baseline

Phase 1 database foundation is applied/validated on the current `ProxyBembem` Supabase project (`kicgoocozxzkuoqajqif`). Phase 2 is also complete: final reviewed runtime candidate `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`, CI `33650730746` / job `100316764581`, with `pnpm test`, `pnpm typecheck`, and `pnpm build` PASS.

Phase 2 migration is already applied as `20260902160658_admin_order_fulfillment_operations`; rollback validation passed 16/16 and left zero synthetic order/event/attention/audit rows. Owner authenticated normally in Preview with password + TOTP and verified `/admin`, `/admin/pedidos`, one real order detail, `/admin/producao`, and `/admin/integrations/melhor-envio` read-only. Checked Preview logs contained no `error`/`fatal` entries.

Do not rediscover/reapply Phase 1 or Phase 2 migrations. Do not merge or promote Production without explicit owner approval.

## Phase 3 approved decisions

Owner explicitly decided on 2026-09-02 that **email is mandatory for every new checkout, including guest checkout**.

Locked consequences:

1. Guest checkout remains supported; account creation remains optional.
2. New orders persist normalized lowercase `customer_email`.
3. Historical orders are not backfilled with fabricated email/customer ownership; new ownership fields remain `NULL` for old orders unless future truth is established explicitly.
4. Authenticated checkout links only to the trusted server-resolved Supabase Auth UUID `customer_id`; browser JSON never supplies a trusted customer UUID.
5. Authenticated checkout uses canonical account email; a mismatching form email is rejected.
6. Supabase Auth email is unique account identity. Minimal `customer_profiles` stores name/WhatsApp/timestamps, not card data.
7. Customer authorization is independent from admin UUID/AAL2/`admin_sessions` authorization.
8. Customer order reads use narrow RPCs deriving ownership from `auth.uid()`; no broad browser SELECT on `orders`.
9. Guest-order claiming requires **verified account email + possession of the existing 64-character public order token**. Email-only/name-only/WhatsApp-only/order-number-only/bulk automatic claim is forbidden.
10. Historical orders with `customer_email IS NULL` remain public-token-trackable but are not claimable in Phase 3.
11. `/pedido/[token]` remains valid after account linking.
12. Customer DTOs exclude public token, checkout attempt/fingerprint/URL, raw shipping snapshot, admin audit, provider credentials/internal secrets.
13. Mercado Pago remains payment authority; customer account code does not mutate financial state.
14. Phase 3 uses only Supabase Auth verification/recovery email. Transactional order-status email remains Phase 6.

## Phase 3 plan

Plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`

Initial plan commit: `f36350f861e4dc8c3b8206f38a75e5bc4350b8f8`.

Plan self-review found no `TODO`, `TBD`, `implement later`, or `Similar to` placeholders. The planned migration is `supabase/migrations/202609020003_customer_accounts_orders.sql` and must remain Git-only until the full Phase 3 candidate is reviewed and owner explicitly approves DDL application.

## Phase 3 Task 1 — migration contract RED: VALID

Test-only file:

`tests/customer-account-migration.test.ts`

RED commit:

`631565b4e2319b697db2ce42487a462ef4d333f2`

GitHub Actions:

- run `33666326422`;
- job `100368874030`;
- `pnpm test`: expected FAILURE;
- total tests: 295;
- PASS: 291;
- FAIL: 4;
- all four failures are the four new migration-contract tests;
- every failure is exactly `ENOENT` for missing `supabase/migrations/202609020003_customer_accounts_orders.sql`;
- no unrelated test failed;
- `pnpm typecheck` and `pnpm build` were skipped because the expected RED stopped the CI job.

This is valid TDD RED evidence. No Phase 3 SQL existed when the failure was captured.

The RED contract requires:

- additive nullable `orders.customer_email` and `orders.customer_id -> auth.users(id)`;
- no historical identity backfill;
- minimal RLS `customer_profiles`;
- customer list/detail RPCs deriving ownership from `auth.uid()` and returning curated safe data;
- no broad authenticated SELECT/write on `orders`;
- service-role-only locked `claim_guest_order_for_customer` requiring token + verified email + trusted customer UUID;
- idempotent `customer_order_claimed` event with `source='customer'` and no token/email metadata;
- no customer claim/payment mutation.

Existing Phase 1 `order_events.source` already allows `customer`; no source-constraint migration is required.

## Current safety gates

- Phase 3 DDL has **not** been applied to Supabase.
- Do not apply Phase 3 DDL until Task 12 full candidate review and a separate explicit owner approval at Task 13.
- Do not merge `feat/admin-dashboard-expansion` without explicit owner approval.
- Do not create/promote a new Production app deployment without explicit owner approval.
- Do not delete the feature branch unless owner asks.
- Do not start Phase 4 runtime work before Phase 3 completion.

## Resume point

**Current Phase 3 status:** Task 1 RED VALID; Task 2 not yet implemented.

**NEXT EXACT ACTION:** create only `supabase/migrations/202609020003_customer_accounts_orders.sql` according to the reviewed Phase 3 plan, run the focused migration contract to obtain GREEN, then run Phase 1/2 migration/payment regressions. Keep the migration in Git only; do not apply it to Supabase. If the focused test fails for a contract mismatch, debug the SQL/test before advancing to checkout-email Task 3.
