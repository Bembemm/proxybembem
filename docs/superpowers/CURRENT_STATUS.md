# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then the active phase plan before making changes.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`
- Active Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- State: **PHASE 1 COMPLETE/APPLIED; PHASE 2 COMPLETE/APPLIED/PREVIEW ACCEPTED; PHASE 3 TASKS 1-3 TDD COMPLETE; TASK 4 RED NEXT**
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

The planned migration is `supabase/migrations/202609020003_customer_accounts_orders.sql` and must remain Git-only until the full Phase 3 candidate is reviewed and owner explicitly approves DDL application.

## Phase 3 Task 1 — migration contract RED: VALID

Test file: `tests/customer-account-migration.test.ts`.

The first RED `631565b4...` correctly proved the migration absent, then review caught one over-broad test guard that would also have forbidden the legitimate claim RPC from setting `customer_id`. The test was narrowed **before any SQL existed** so it forbids historical backfill while explicitly requiring the safe claim update.

Canonical RED:

- commit `619db2cb966b188cf759ed51ccd374dc60a53d0b`;
- CI run `33666738154`;
- job `100370241591`;
- `pnpm test`: expected FAILURE;
- total tests: 295;
- PASS: 291;
- FAIL: 4;
- all four failures are the four new migration-contract tests;
- every failure is exactly `ENOENT` for missing `supabase/migrations/202609020003_customer_accounts_orders.sql`;
- no unrelated test failed;
- `pnpm typecheck` and `pnpm build` were skipped because expected RED stopped the CI job.

This is the final valid TDD RED. No Phase 3 SQL existed when it was captured.

## Phase 3 Task 2 — additive account/order migration: GREEN, GIT-ONLY

Migration: `supabase/migrations/202609020003_customer_accounts_orders.sql`.

The migration adds only compatibility-safe nullable customer ownership/email data and narrow customer RPC/profile boundaries. It does not backfill historical customer identity and it has **not** been applied to Supabase.

Implementation history:

- migration commit `e0fdcfda04e3cedfcd27fece9b82d8e94f1d51ff`;
- first GREEN CI exposed one test false positive: the safe constant phrase `verified_email_and_public_token` was incorrectly interpreted by a regex as secret token leakage;
- the SQL remained unchanged and only the test expectation was narrowed to reject actual token/email keys or values while explicitly requiring the safe claim-method marker;
- final Task 2 candidate commit `032c65102c9204688fb51937a250bf98a0dd1795`;
- CI run `33667341942`;
- job `100372226704`;
- 295 tests PASS;
- `pnpm typecheck` PASS;
- `pnpm build` PASS;
- workflow SUCCESS.

Task 2 migration remains **Git-only**. Do not apply it before the Phase 3 full-candidate owner gate.

## Phase 3 Task 3 — mandatory checkout email: RED/GREEN COMPLETE

New contract:

- `CheckoutData.email` is required;
- checkout email is trimmed/lowercased;
- conservative validation requires a non-whitespace `local@domain` shape with maximum 254 characters;
- checkout UI has an accessible required `type="email"` field;
- `/api/checkout` requires email as a strict string customer field;
- normalized email participates in checkout idempotency fingerprint;
- WhatsApp fallback summary includes the normalized contact email;
- there is no permissive fallback for missing email.

Canonical RED:

- test: `tests/checkout-email.test.ts`;
- commit `f128b6df56531e8c396ade327e0d12842c937575`;
- CI run `33667562183`;
- total tests: 299;
- PASS: 295;
- FAIL: exactly 4, all four new Task 3 email tests;
- failures proved missing email normalization/validation, fingerprint identity, UI field, and API parser;
- no unrelated existing test failed.

GREEN implementation included `lib/checkout.ts`, `components/checkout-form.tsx`, `components/cart-panel.tsx`, `app/api/checkout/route.ts`, and `lib/server/checkout-idempotency.ts`.

Intermediate verification at commit `f9021bd960bab1333aa9ef942a464a175848cc79`, CI `33668433926`, job `100375790994`, found 13 failures. Systematic debugging established that all four new Task 3 tests already passed and every remaining failure came from four legacy test fixtures constructing `CheckoutData` without the newly mandatory `email`, causing `normalizeCheckoutEmail(undefined)` before those tests reached their intended behavior. Runtime was **not** weakened with a missing-email fallback; only the stale fixtures were corrected.

Final Task 3 candidate:

- commit `70319add3f2a8c139b25fdb4ca5a3fefd80b14d9`;
- CI run `33668791985`;
- job `100376977017`;
- `pnpm test`: 299 total, 299 PASS, 0 FAIL;
- `pnpm typecheck`: PASS (`tsc --noEmit`);
- `pnpm build`: PASS on Next.js 16.3.3; compiled successfully and generated 17/17 static pages;
- workflow conclusion: SUCCESS.

Task 3 is therefore the current verified runtime checkpoint. Phase 3 DDL is still unapplied.

## Current safety gates

- Phase 3 DDL has **not** been applied to Supabase.
- Do not apply Phase 3 DDL until Task 12 full candidate review and a separate explicit owner approval at Task 13.
- Do not merge `feat/admin-dashboard-expansion` without explicit owner approval.
- Do not create/promote a new Production app deployment without explicit owner approval.
- Do not delete the feature branch unless owner asks.
- Do not start Phase 4 runtime work before Phase 3 completion.
- Customer auth Task 4 must remain separate from `ADMIN_USER_ID`, AAL2 and `admin_sessions`.

## Resume point

**Current Phase 3 status:** Tasks 1-3 complete with TDD evidence. Final verified Task 3 candidate is `70319add3f2a8c139b25fdb4ca5a3fefd80b14d9`, CI `33668791985`, job `100376977017`.

**NEXT EXACT ACTION:** Phase 3 Task 4 RED. Create only `tests/customer-auth.test.ts`, covering optional no-user identity, verified canonical customer identity, malformed/unverified rejection, strict separation from admin authorization/session state, and `/entrar` redirect for protected customer pages. Run `node --experimental-strip-types --test tests/customer-auth.test.ts` and capture expected module-missing RED **before** creating `lib/server/customer-auth.ts`. Then implement the minimum GREEN using `createSupabaseServerClient().auth.getUser()` and verify alongside `tests/admin-auth.test.ts`.
