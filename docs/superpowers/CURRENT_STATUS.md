# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then the active phase plan before making changes.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`
- Active Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- State: **PHASE 1 COMPLETE/APPLIED; PHASE 2 COMPLETE/APPLIED/PREVIEW ACCEPTED; PHASE 3 TASKS 1-6 TDD COMPLETE; TASK 7 RED NEXT**
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

## Phase 3 Task 4 — customer auth boundary: RED/GREEN COMPLETE

The customer auth boundary is intentionally independent from admin authorization. It trusts only a network-validated Supabase Auth user from `auth.getUser()`, requires a canonical non-nil UUID plus confirmed normalized email, and redirects protected customer pages to `/entrar` when no trusted customer identity exists. It does **not** use `ADMIN_USER_ID`, AAL2, `admin_sessions`, admin activation/session RPCs, `auth.getSession()`, or `/admin/login`.

First RED attempt:

- test commit `2ed4e21093a7cdd9439379a672bcb02e806a24ea`;
- CI run `33669446978`;
- job `100379130201`;
- this RED is **not canonical** because Node's `--experimental-strip-types` rejected a TypeScript parameter property in the test harness before module resolution;
- no production `lib/server/customer-auth.ts` existed at this point.

The harness alone was corrected in commit `27eef709a53f91b76a79457f85473bb41d54aced`, still with no production customer-auth module.

Canonical RED:

- commit `27eef709a53f91b76a79457f85473bb41d54aced`;
- CI run `33669616396`;
- job `100379689434`;
- total tests: 300;
- PASS: 299;
- FAIL: exactly 1, `tests/customer-auth.test.ts`;
- failure is exactly `ERR_MODULE_NOT_FOUND` for missing `lib/server/customer-auth.ts`;
- `pnpm typecheck` and `pnpm build` were skipped because expected RED stopped the CI job.

GREEN implementation:

- production module: `lib/server/customer-auth.ts`;
- final Task 4 candidate commit `e88ddbe84f89c48024856d7d53bad27ff45240cb`;
- CI run `33669788637`;
- job `100380261347`;
- `pnpm test`: 305 total, 305 PASS, 0 FAIL;
- all six `tests/customer-auth.test.ts` cases PASS;
- existing `tests/admin-auth.test.ts` regression suite PASS in the same run;
- `pnpm typecheck`: PASS (`tsc --noEmit`);
- `pnpm build`: PASS on Next.js 16.3.3; compiled successfully, TypeScript finished, and generated 17/17 static pages;
- workflow conclusion: SUCCESS.

## Phase 3 Task 5 — persist checkout email and trusted ownership: RED/GREEN COMPLETE

The checkout/order boundary now persists normalized `customer_email` for every new order and persists `customer_id` only from the trusted server-resolved Supabase Auth identity. Guest orders explicitly persist `customer_id = null`. Browser JSON still has no trusted customer UUID input. An authenticated form email that differs from the canonical account email fails with `CheckoutFlowValidationError("Authenticated email mismatch")` before reservation. Admin order detail may display `customer_email` read-only, while `customer_id` remains outside the admin detail select and UI.

Canonical RED:

- checkout/order RED commit `b5d00ad4f4399789fb70a37a90d541ff33584671` initially produced 311 total / 305 PASS / 6 expected FAIL;
- admin read-only email coverage was added before runtime in commit `5d5e56c163c4b1f63a2f98b2cf53a642c46775b5`;
- canonical final RED CI run `33671059941`, job `100384508027`;
- total tests: 313;
- PASS: 305;
- FAIL: exactly 8, all Task 5 contracts;
- failures proved missing guest/authenticated persistence, missing mismatch rejection, missing server identity wiring, and missing safe admin email detail;
- no unrelated existing test failed;
- `pnpm typecheck` and `pnpm build` were skipped because expected RED stopped the CI job.

GREEN implementation commits:

- `595bfebbba456572f84d28fd13ddbdf17356dce7` — persist `customer_email/customer_id` in `OrderRecord`, `CreateOrderInput`, selects, and create payload;
- `476d5f6a5e0f97aaab01fc7e67f80fd2bcf963fd` — propagate trusted `CustomerIdentity`, enforce canonical-email match, persist guest/auth ownership correctly;
- `5a2fa4a16f0caa1c66059257c1982a2d64087381` — resolve `getOptionalCustomerIdentity()` in `/api/checkout` server-side;
- `b4cc070e640d20cfd9cfbdffd8847901626227c9` — expose only `customer_email` in safe admin order detail repository;
- `dce46c2489a247957a703fed962d50748228014e` — render read-only customer email in admin order detail.

Intermediate verification and debugging:

1. At `dce46c2489a247957a703fed962d50748228014e`, CI `33671839995`, job `100387081269`, 312/313 tests passed. All eight new Task 5 tests already passed. The only failure was a stale legacy `admin-orders-repository` fixture omitting the new nullable `customer_email`; runtime was not relaxed. Fixture corrected in `5d5d5ac9b4a5ea12f3127eea9347b2b5304b6e91`.
2. At `5d5d5ac9b4a5ea12f3127eea9347b2b5304b6e91`, CI `33672013981`, job `100387652980`, all 313 tests passed, but typecheck found five test-fixture typing errors: two callback-captured `reservedInput` values narrowed to `never` in `checkout-flow.test.ts`, plus one `OrderRecord` fixture missing required `customer_email/customer_id`. Build was skipped. No runtime defect was indicated.
3. The callback captures were changed to typed arrays in `18e767a56588dd70f8939199a3afe68a13de8e78`; the order-display fixture received explicit null ownership fields in `fc3007ae3ad5f20c8a9397de3131cb1c5f39eea6`. No runtime behavior was weakened.

Final Task 5 candidate:

- commit `fc3007ae3ad5f20c8a9397de3131cb1c5f39eea6`;
- CI run `33672384721`;
- job `100388871069`;
- `pnpm test`: 313 total, 313 PASS, 0 FAIL;
- Task 5 guest ownership, authenticated ownership, mismatch rejection, server-only route identity, order persistence, and read-only admin email tests all PASS;
- `pnpm typecheck`: PASS (`tsc --noEmit`);
- `pnpm build`: PASS on Next.js 16.3.3; compiled successfully, TypeScript finished, and generated 17/17 static pages;
- workflow conclusion: SUCCESS.

## Phase 3 Task 6 — RLS customer profile repository: RED/GREEN COMPLETE

The customer profile repository now uses the request-scoped authenticated Supabase SSR client and `customer_profiles` RLS boundary. Name is normalized to single internal whitespace and 3..100 characters; WhatsApp is digits-only with 10 or 11 digits. Writes derive profile ownership from the network-validated `auth.getUser()` UUID and accept only name/WhatsApp from caller input. Returned DTOs include exactly `id`, `name`, `whatsapp`, `createdAt`, and `updatedAt`; extra storage fields are discarded. No admin authorization, privileged Supabase secret, arbitrary caller profile ID, email write, or password write is part of this repository.

Canonical RED:

- test file: `tests/customer-profile.test.ts`;
- commit `985cf31825a1342e422013525b2a222f07e15b3e`;
- CI run `33672735811`;
- job `100390032334`;
- total tests: 314;
- PASS: 313;
- FAIL: exactly 1, the customer-profile module-load test;
- failure is exactly `ERR_MODULE_NOT_FOUND` for missing `lib/server/customer-profiles.ts`;
- all pre-existing tests, including Task 5 and customer-auth regressions, passed;
- `pnpm typecheck` and `pnpm build` were skipped because expected RED stopped the CI job;
- no production customer-profile module existed when this RED was captured.

GREEN implementation:

- module: `lib/server/customer-profiles.ts`;
- commit `bc66eaf932b5dc3c710813cce8c3abd503cc6b1d`;
- dependency-injected core covers strict safe parsing, normalization, trusted current-user ownership, read/ensure/update operations, and mismatch fail-closed behavior;
- production adapter calls `createSupabaseServerClient()`, validates identity through `supabase.auth.getUser()`, and reads/writes only `.from("customer_profiles")` through the caller session so RLS remains the ownership boundary;
- storage errors are mapped to generic repository failures without leaking provider details.

Final Task 6 verification:

- CI run `33673027354`;
- job `100390979088`;
- `pnpm test`: 318 total, 318 PASS, 0 FAIL;
- all five `tests/customer-profile.test.ts` cases PASS;
- customer-auth and existing admin/security regressions PASS in the same run;
- `pnpm typecheck`: PASS (`tsc --noEmit`);
- `pnpm build`: PASS on Next.js 16.3.3; compiled successfully, TypeScript finished, and generated 17/17 static pages;
- workflow conclusion: SUCCESS.

Task 6 is the current verified runtime checkpoint. Phase 3 DDL remains unapplied.

## Current safety gates

- Phase 3 DDL has **not** been applied to Supabase.
- Do not apply Phase 3 DDL until Task 12 full candidate review and a separate explicit owner approval at Task 13.
- Do not merge `feat/admin-dashboard-expansion` without explicit owner approval.
- Do not create/promote a new Production app deployment without explicit owner approval.
- Do not delete the feature branch unless owner asks.
- Do not start Phase 4 runtime work before Phase 3 completion.
- Customer authorization must remain separate from `ADMIN_USER_ID`, AAL2 and `admin_sessions`.
- Task 7 account auth actions must use same-origin mutation protection, bounded JSON parsing, rate limiting, generic password-reset anti-enumeration responses, allowlisted local callback destinations, and no secret/password logging.

## Resume point

**Current Phase 3 status:** Tasks 1-6 complete with TDD evidence. Final verified Task 6 candidate is `bc66eaf932b5dc3c710813cce8c3abd503cc6b1d`, CI `33673027354`, job `100390979088`.

**NEXT EXACT ACTION:** Phase 3 Task 7 RED. Create only `tests/customer-account-actions.test.ts` first, covering same-origin protection for mutating account routes, bounded strict JSON input, generic anti-enumeration password-reset behavior, safe local callback `next` allowlisting, required account rate-limit scopes, and preservation of existing admin proxy matchers while adding account/customer surfaces. Capture the expected RED before creating `lib/server/customer-account-actions.ts` or any new account/auth API route. Then implement signup/callback/login/logout/password-reset/password-update and proxy/rate-limit wiring in the planned GREEN steps.
