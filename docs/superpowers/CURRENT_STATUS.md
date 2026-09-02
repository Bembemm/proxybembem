# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then `docs/superpowers/plans/2026-09-02-customer-account-orders.md` before making changes. Detailed earlier evidence remains in Git history; this file keeps the current no-rediscovery state and exact resume action.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- State: **PHASE 1 COMPLETE/APPLIED; PHASE 2 COMPLETE/APPLIED/PREVIEW ACCEPTED; PHASE 3 TASKS 1-10 TDD COMPLETE; TASK 11 SECURITY MATRIX NEXT**
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
8. Customer order reads use narrow RPCs deriving ownership from `auth.uid()`; TypeScript never sends a customer UUID to read RPCs.
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

The first RED commit `5a1bca7891b47dc75a636718529c26a6737eb8c6` is **non-canonical** because review found the test itself diverged from the approved plan. No Task 7 runtime code existed yet. The test was corrected before GREEN.

Canonical RED `58befa3c0805662bee833cd3f79b4d14693f50f8`, CI `33675807205`, job `100400061244`: 327 total / 318 PASS / exactly 9 expected FAIL, all Task 7 contracts.

Final candidate `85bb1d880684e14ffbdb18fd66b875d6e8c5a2`, CI `33676377828`, job `100401981356`: 327/327 tests PASS, typecheck PASS, build PASS on Next.js 16.3.3 with 23/23 static pages.

### Task 8 — customer-owned order repository

Canonical RED `aeb33ad60b489f5db615726d4f2d0e48ba79619b`, CI `33676897007`, job `100403780051`: 328 total / 327 PASS / exactly 1 expected module-missing FAIL.

Final candidate `126158df19cc51f97154006f830ad31222ce8e89`, CI `33677214460`, job `100404817672`: 334/334 tests PASS, typecheck PASS, build PASS with 23/23 static pages. Read RPCs remain `auth.uid()`-derived and TypeScript never accepts/sends a customer UUID.

### Task 9 — secure guest-order claim

Canonical RED `f9c95f73801155da583365d553431b68df6595c7`, CI `33677670040`, job `100406317560`: 343 total / 334 PASS / exactly 9 expected FAIL, all Task 9 contracts only.

Final candidate `c8e836cf69de086d2000d0fc9904af9b24d2307b`, CI `33682338553`, job `100421604971`: 343/343 tests PASS, typecheck PASS, build PASS with 24/24 static pages. Claim requires verified trusted identity plus the 64-character public token; route JSON accepts only `{publicToken}`; public token tracking remains valid and historical null-email orders remain unclaimable.

### Task 10 — customer account UI

Canonical RED:

- test `tests/customer-account-ui.test.ts`;
- commit `c1d201fdaf59db94629b6b5189ef13c291fb3950`;
- CI run `33682792731`;
- job `100423066698`;
- 351 total / 344 PASS / exactly 7 FAIL;
- all seven failures were Task 10 only: missing separate login-next sanitizer, public account pages/forms, protected account shell, account order pages, profile save surface, and security/password surface;
- every pre-existing test, including Task 9, passed;
- typecheck/build skipped because the expected RED stopped CI.

GREEN implementation includes:

- separate `sanitizeCustomerLoginNext` that keeps the auth callback sanitizer unchanged while allowing only `/minha-conta...` or exact `/pedido/<64-hex>` return targets;
- exact `{name,whatsapp}` profile input parser; browser cannot supply owner UUID;
- storefront public `/entrar`, `/criar-conta`, `/esqueci-a-senha` pages and accessible account forms;
- protected storefront `/minha-conta` shell with `Visão geral`, `Pedidos`, `Perfil`, `Segurança`, and POST-only local logout;
- overview and paginated order list using only customer-owned repository DTOs;
- customer order detail showing curated items/totals/status/address/shipping/timeline and WhatsApp support text containing only the order number;
- profile route with same-origin, `account-profile` rate limit, verified customer access, bounded JSON, RLS own-profile create/update, and no arbitrary owner input;
- security page with read-only account email, password update, and recovery entry point;
- no admin shell/boundary imports and no forbidden order internals rendered in customer-account code.

Final Task 10 candidate:

- commit `a8cda3d929e0af86810137f423c0ce625f448391`;
- CI run `33683574794`;
- job `100425591216`;
- `pnpm test`: **351 total / 351 PASS / 0 FAIL**;
- all eight Task 10 structural/security tests PASS and existing regressions PASS;
- `pnpm typecheck`: PASS (`tsc --noEmit`);
- `pnpm build`: PASS on Next.js 16.3.3, compiled successfully and generated **28/28** static pages;
- build manifest contains `/criar-conta`, `/entrar`, `/esqueci-a-senha`, all planned `/minha-conta` routes, and `/api/account/profile`;
- workflow conclusion: SUCCESS.

Task 10 is the current verified runtime checkpoint. No Phase 3 DDL was applied and no Preview/Production deployment was promoted.

## Current safety gates

- Phase 3 DDL remains unapplied.
- Do not apply Phase 3 DDL before Task 12 review + explicit Task 13 owner approval.
- Do not merge `feat/admin-dashboard-expansion` without explicit owner approval.
- Do not create/promote a new Production application deployment without explicit owner approval.
- Do not delete the feature branch unless owner asks.
- Do not start Phase 4 runtime work before Phase 3 completion.
- Customer read authorization must stay `auth.uid()`-derived; never accept/pass a customer UUID for own-order list/detail reads.
- Guest-order claim must require both the verified current customer identity and the existing 64-character public token; route JSON may accept only `{publicToken}`.
- Customer DTOs must remain curated and exclude all forbidden internal fields listed above.
- Customer account UI must remain separate from admin authorization and admin shell styling.

## Resume point

**Current Phase 3 status:** Tasks 1-10 complete with TDD evidence. Final verified Task 10 runtime candidate is `a8cda3d929e0af86810137f423c0ce625f448391`, CI `33683574794`, job `100425591216`.

**NEXT EXACT ACTION:** Phase 3 Task 11 security/isolation matrix. Create only `tests/customer-account-security.test.ts`. Prove customer A cannot retrieve customer B order through repository dependency fixtures and database contract; missing vs other-owned detail has identical null behavior; public token tracking remains independent from account ownership; claim rejects wrong verified email even with a valid token; claim cannot occur with only email or only token; an ordinary customer session still fails admin authorization unless immutable owner UUID + AAL2 + active admin-session requirements are independently met; and all customer DTOs remain free of forbidden internal fields. Run this security suite before changing production code. If a test reveals a real defect, use systematic debugging and add only the minimal fix.
