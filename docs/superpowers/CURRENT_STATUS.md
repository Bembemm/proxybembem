# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then `docs/superpowers/plans/2026-09-02-customer-account-orders.md` before making changes. Detailed earlier evidence remains in Git history; this file keeps the current no-rediscovery state and exact resume action.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- State: **PHASE 1 COMPLETE/APPLIED; PHASE 2 COMPLETE/APPLIED/PREVIEW ACCEPTED; PHASE 3 TASKS 1-7 TDD COMPLETE; TASK 8 RED NEXT**
- Phase 3 migration application: **NOT APPROVED / NOT APPLIED**
- Merge/new Production application deployment: **NOT APPROVED**

## Applied baseline — do not rediscover or reapply

Phase 1 data/audit foundation and Phase 2 admin orders/fulfillment are already applied and validated on the current ProxyBembem Supabase project. Phase 2 migration is recorded as `20260902160658_admin_order_fulfillment_operations`; rollback validation left zero synthetic order/event/attention/audit rows. Phase 2 Preview was owner-accepted with normal password + TOTP admin authentication and read-only operational smoke. Production was not changed by Phase 3 work.

Do not reapply Phase 1/2 migrations. Do not merge, promote, or delete the feature branch without explicit owner permission.

## Phase 3 locked decisions — do not rediscover

1. Email is mandatory for every new checkout, including guest checkout.
2. Guest checkout remains supported and account creation remains optional.
3. New orders persist normalized lowercase `customer_email`; historical orders are not backfilled with fabricated identity.
4. `customer_id` comes only from the trusted server-resolved Supabase Auth UUID. Browser JSON never chooses a customer UUID.
5. Authenticated checkout uses canonical account email; a mismatching form email is rejected before reservation.
6. Supabase Auth email is the unique account identity. `customer_profiles` stores only minimal name/WhatsApp/timestamps, never card data or passwords.
7. Customer authorization is independent from `ADMIN_USER_ID`, AAL2, and `admin_sessions`.
8. Customer order reads must use narrow RPCs deriving ownership from `auth.uid()`; TypeScript never sends a customer UUID to read RPCs.
9. Guest-order claim requires verified account email plus possession of the existing 64-character public token. No email-only/name-only/WhatsApp-only/order-number-only/bulk claim.
10. Historical orders with `customer_email IS NULL` remain public-token-only and are not claimable in Phase 3.
11. `/pedido/[token]` remains valid after account linking.
12. Customer DTOs exclude public token, checkout attempt/fingerprint/URL, raw shipping snapshot, admin audit, provider credentials, raw `payment_id`, and `preference_id`.
13. Mercado Pago remains the financial authority; customer account code does not mutate payment state.
14. Phase 3 uses Supabase Auth verification/recovery email only. Transactional order-status email remains Phase 6.

## Phase 3 migration gate

Planned migration: `supabase/migrations/202609020003_customer_accounts_orders.sql`.

It exists in Git and remains **Git-only**. Do not apply it until Task 12 full-candidate review is complete and the owner separately approves Task 13 DDL application. Runtime work may compile against the planned schema, but no Preview/Production account flow is considered database-compatible until that later gate.

## Phase 3 completed task evidence

### Task 1 — migration contract RED

Canonical RED `619db2cb966b188cf759ed51ccd374dc60a53d0b`, CI `33666738154`, job `100370241591`: 295 total / 291 PASS / 4 expected FAIL, all due to the absent Phase 3 migration. No unrelated failure.

### Task 2 — additive migration GREEN, Git-only

Final candidate `032c65102c9204688fb51937a250bf98a0dd1795`, CI `33667341942`, job `100372226704`: 295 tests PASS, typecheck PASS, build PASS. Migration remains unapplied.

### Task 3 — mandatory checkout email

Final candidate `70319add3f2a8c139b25fdb4ca5a3fefd80b14d9`, CI `33668791985`, job `100376977017`: 299/299 tests PASS, typecheck PASS, build PASS. Runtime requires/normalizes email and includes it in checkout identity.

### Task 4 — customer auth boundary

Final candidate `e88ddbe84f89c48024856d7d53bad27ff45240cb`, CI `33669788637`, job `100380261347`: 305/305 tests PASS, typecheck PASS, build PASS. Customer identity is based on network-validated `auth.getUser()` and verified email, independent from admin authorization.

### Task 5 — persist checkout email + trusted ownership

Final candidate `fc3007ae3ad5f20c8a9397de3131cb1c5f39eea6`, CI `33672384721`, job `100388871069`: 313/313 tests PASS, typecheck PASS, build PASS. Guest orders persist null owner; authenticated orders persist only trusted server identity. Admin detail may show email read-only but not customer UUID.

### Task 6 — RLS customer profile repository

Canonical RED `985cf31825a1342e422013525b2a222f07e15b3e`, CI `33672735811`, job `100390032334`: 314 total / 313 PASS / 1 expected module-missing FAIL.

Final candidate `bc66eaf932b5dc3c710813cce8c3abd503cc6b1d`, CI `33673027354`, job `100390979088`: 318/318 tests PASS, typecheck PASS, build PASS. `lib/server/customer-profiles.ts` uses the authenticated request-scoped SSR client and `customer_profiles` RLS; no service-role bypass, arbitrary profile ID, email write, or password write.

### Task 7 — account auth actions + Supabase callback

The first RED commit `5a1bca7891b47dc75a636718529c26a6737eb8c6` is **non-canonical** because review found the test itself diverged from the approved plan: it named password routes incorrectly and expected permissive extra fields/logout JSON behavior. No Task 7 runtime code existed yet. The test was corrected before GREEN.

Canonical RED:

- commit `58befa3c0805662bee833cd3f79b4d14693f50f8`;
- CI run `33675807205`;
- job `100400061244`;
- 327 total / 318 PASS / exactly 9 FAIL;
- all nine failures are Task 7 contracts: missing action module, rate-limit scopes, proxy matchers, auth routes/callback, intended Supabase operations, and generic reset copy;
- no unrelated existing test failed;
- typecheck/build skipped because expected RED stopped CI.

GREEN implementation includes:

- `lib/server/customer-account-actions.ts`: exact payload-key validation, bounded normalized signup/login/reset/password inputs, exact same-origin Origin check, safe `/minha-conta` `next` allowlist, validated profile metadata;
- `lib/server/rate-limit.ts`: `account-signup` 5/900, `account-login` 10/600, `account-password-reset` 5/900, `account-profile` 20/600, `account-claim` 10/600;
- `proxy.ts`: retains all admin matchers and adds `/entrar`, `/criar-conta`, `/esqueci-a-senha`, `/auth/callback`, `/minha-conta/:path*`, `/api/account/:path*`;
- `POST /api/account/signup`: strict body, same-origin, rate limit, Supabase `signUp`, verified-email redirect, only name/WhatsApp metadata, generic verification response;
- `POST /api/account/login`: `signInWithPassword`, `getUser`, verified email required, generic credential failures;
- `POST /api/account/logout`: same-origin local sign-out;
- `POST /api/account/password-reset`: strict body/rate limit, `resetPasswordForEmail`, recovery callback, anti-enumeration success text;
- `POST /api/account/password`: authenticated verified session + bounded new password + `updateUser`;
- `GET /auth/callback`: PKCE `exchangeCodeForSession`, verified user, safe local next, validated metadata, `ensureOwnCustomerProfile`, setup redirect when profile metadata is absent/invalid.

Final Task 7 candidate:

- commit `85bb1d880684e14ffbdbdb18fd66b875d6e8c5a2`;
- CI run `33676377828`;
- job `100401981356`;
- `pnpm test`: **327 total / 327 PASS / 0 FAIL**;
- all 9 Task 7 tests PASS and existing admin/customer regressions PASS;
- `pnpm typecheck`: PASS (`tsc --noEmit`);
- `pnpm build`: PASS on Next.js 16.3.3, compiled successfully and generated **23/23** static pages;
- workflow conclusion: SUCCESS.

Task 7 is the current verified runtime checkpoint. No Phase 3 DDL was applied and no Preview/Production deployment was promoted.

## Current safety gates

- Phase 3 DDL remains unapplied.
- Do not apply Phase 3 DDL before Task 12 review + explicit Task 13 owner approval.
- Do not merge `feat/admin-dashboard-expansion` without explicit owner approval.
- Do not create/promote a new Production application deployment without explicit owner approval.
- Do not delete the feature branch unless owner asks.
- Do not start Phase 4 runtime work before Phase 3 completion.
- Customer read authorization must stay `auth.uid()`-derived; never accept/pass a customer UUID for own-order list/detail reads.
- Customer DTOs must remain curated and exclude all forbidden internal fields listed above.

## Resume point

**Current Phase 3 status:** Tasks 1-7 complete with TDD evidence. Final verified Task 7 runtime candidate is `85bb1d880684e14ffbdbdb18fd66b875d6e8c5a2`, CI `33676377828`, job `100401981356`.

**NEXT EXACT ACTION:** Phase 3 Task 8 RED. Create only `tests/customer-orders.test.ts` first. Cover page/pageSize bounds, canonical order UUID validation, strict parsing of the curated `customer_list_orders` / `customer_get_order` RPC shapes, safe handling of unknown payment-status display values, exclusion of forbidden internal keys, `null` for missing/not-owned detail, authenticated SSR client usage, and proof that no customer UUID is accepted or sent to either read RPC. Run the RED and capture the expected missing `lib/server/customer-orders.ts` failure before implementing that module. Then implement only the strict authenticated RPC wrappers and run GREEN.
