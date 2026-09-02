# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then `docs/superpowers/plans/2026-09-02-customer-account-orders.md` before making changes. Detailed intermediate evidence remains in Git history; this file records the current no-rediscovery state and exact resume action.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- State: **PHASE 1 COMPLETE/APPLIED; PHASE 2 COMPLETE/APPLIED/PREVIEW ACCEPTED; PHASE 3 TASKS 1-12 COMPLETE/REVIEWED; TASK 13 OWNER DDL APPROVAL GATE NEXT**
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
8. Customer order reads use narrow RPCs deriving ownership from `auth.uid()`; TypeScript never sends a customer UUID to list/detail RPCs.
9. Guest-order claim requires verified account email plus possession of the existing 64-character public token. No email-only/name-only/WhatsApp-only/order-number-only/bulk claim.
10. Historical orders with `customer_email IS NULL` remain public-token-only and are not claimable in Phase 3.
11. `/pedido/[token]` remains valid after account linking.
12. Customer DTOs exclude public token, checkout attempt/fingerprint/URL, raw shipping snapshot, admin audit, provider credentials, raw `payment_id`, and `preference_id`.
13. Mercado Pago remains the financial authority; customer account code does not mutate payment state.
14. Phase 3 uses Supabase Auth verification/recovery email only. Transactional order-status email remains Phase 6.

## Phase 3 migration gate

Exact reviewed migration: `supabase/migrations/202609020003_customer_accounts_orders.sql`.

The migration **exists in Git and is still unapplied**. Task 12 review is complete. Do not apply it until the owner explicitly approves Task 13 in chat.

Reviewed migration contract:

- nullable normalized `orders.customer_email` and nullable `orders.customer_id -> auth.users(id)`; no historical backfill;
- own-row RLS `customer_profiles`, no DELETE grant;
- authenticated `customer_list_orders` and `customer_get_order`, both deriving ownership from `auth.uid()` and returning curated JSON only;
- service-role-only `claim_guest_order_for_customer`, verified Auth email + public token, `FOR UPDATE`, idempotent event, no email/token metadata;
- historical null-email orders remain not claimable;
- `order_events.source='customer'` is compatible with the already-applied Phase 1 constraint.

## Phase 3 task evidence

### Tasks 1-8

- Task 1 canonical RED `619db2cb966b188cf759ed51ccd374dc60a53d0b`, CI `33666738154`, job `100370241591`: 295 total / 291 PASS / 4 expected migration-absent FAIL.
- Task 2 final `032c65102c9204688fb51937a250bf98a0dd1795`, CI `33667341942`: migration contract GREEN, 295 tests + typecheck + build PASS; SQL stayed Git-only.
- Task 3 final `70319add3f2a8c139b25fdb4ca5a3fefd80b14d9`, CI `33668791985`: 299/299 + typecheck + build PASS; checkout email mandatory/normalized/idempotency-aware.
- Task 4 final `e88ddbe84f89c48024856d7d53bad27ff45240cb`, CI `33669788637`: 305/305 + typecheck + build PASS; verified customer auth boundary independent from admin auth.
- Task 5 final `fc3007ae3ad5f20c8a9397de3131cb1c5f39eea6`, CI `33672384721`: 313/313 + typecheck + build PASS; guest null owner/authenticated trusted owner only.
- Task 6 final `bc66eaf932b5dc3c710813cce8c3abd503cc6b1d`, CI `33673027354`: 318/318 + typecheck + build PASS; profile repository uses authenticated SSR + RLS, no service-role bypass.
- Task 7 final `85bb1d880684e14ffbdbdb18fd66b875d6e8c5a2`, CI `33676377828`: 327/327 + typecheck + build PASS; signup/login/logout/reset/update/callback and bounded account rate limits.
- Task 8 final `126158df19cc51f97154006f830ad31222ce8e89`, CI `33677214460`: 334/334 + typecheck + build PASS; own-order RPC repository never sends customer UUID.

### Task 9 — secure guest-order claim

Canonical RED `f9c95f73801155da583365d553431b68df6595c7`: 343 total / 334 PASS / exactly 9 Task 9 failures before runtime existed.

Final candidate `c8e836cf69de086d2000d0fc9904af9b24d2307b`, CI `33682338553`, job `100421604971`:

- `pnpm test`: **343/343 PASS**;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS, 24/24 static pages;
- claim route accepts only `{publicToken}` after same-origin/rate-limit/verified-customer checks;
- service-role repository receives token + trusted UUID/email only;
- public tracking keeps token route valid and exposes claim CTA only when appropriate.

### Task 10 — storefront customer account UI

Canonical RED `c1d201fdaf59db94629b6b5189ef13c291fb3950`, CI `33682792731`, job `100423066698`: 351 total / 344 PASS / exactly 7 Task 10 failures before the planned UI existed.

Final runtime candidate `a8cda3d929e0af86810137f423c0ce625f448391`, CI `33683574794`, job `100425591216`:

- `pnpm test`: **351/351 PASS**;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS, 28/28 static pages;
- public `/entrar`, `/criar-conta`, `/esqueci-a-senha` plus protected `/minha-conta`, own orders/detail, profile and security routes;
- storefront shell is separate from admin shell/auth;
- account UI renders only curated customer-safe DTOs.

### Task 11 — security/isolation matrix

Initial security-matrix commit `575be0ecd07353c2dc94ce3e45dcdfb8710e213e`, CI `33683938053`, job `100426772012`: 359 total / 358 PASS / 1 FAIL. The sole failure was a brittle test assertion that expected direct `customer_id = auth.uid()` syntax while the SQL correctly assigns `v_customer_id := auth.uid()` and filters `o.customer_id = v_customer_id`; no runtime defect was found.

After fixing only test assertion/typing fixtures, final Task 11/Task 12 runtime-review candidate is `1f2432bd000e7e01201d0f2d632cac51399f86d0`, CI `33684404621`, job `100428283809`:

- `pnpm test`: **359/359 PASS / 0 FAIL**;
- all eight `customer-account-security.test.ts` cases PASS;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS, 28/28 static pages;
- customer A cannot retrieve B through the repository contract;
- missing and other-owned detail are identical `null` behavior;
- public token tracking stays independent from ownership;
- wrong verified email + valid token remains generic `not_claimable`;
- email-only/token-only claim is impossible;
- ordinary customer session cannot cross the independent admin UUID/AAL2/app-session boundary;
- customer DTOs contain none of the forbidden internal fields.

### Task 12 — full Phase 3 candidate review

Reviewed exact runtime candidate: `1f2432bd000e7e01201d0f2d632cac51399f86d0`.

Evidence:

- CI `33684404621`, job `100428283809`: full `pnpm test`, `pnpm typecheck`, `pnpm build` PASS;
- the nine focused Phase 3 test files requested by the plan all execute inside that full test job and all their cases are PASS;
- compare against accepted Phase 2 checkpoint `68e50102cfcaa5c9720432db1d1e504d5e7e1267` shows Phase 3-only scope: customer auth/account/order modules, email/ownership checkout changes, additive migration, account UI/routes, tests/docs;
- no static catalog authority switch, label purchase, Phase 6 transactional notifications, hosting redesign, or admin-auth weakening is in the Phase 3 diff;
- Mercado Pago remains the payment authority; Phase 3 only adds trusted account identity/email to order ownership and does not locally change payment state;
- browser never selects customer UUID; customer reads derive `auth.uid()`; claim is service-role-only and row-locked;
- no email-only claim and no public token in account DTOs;
- Task 12 found no runtime defect requiring a production-code change.

## Current safety gates

- Phase 3 DDL remains **unapplied**.
- Task 12 review is complete; Task 13 now requires explicit owner approval before DDL.
- Do not merge `feat/admin-dashboard-expansion` without explicit owner approval.
- Do not create/promote a new Production application deployment without explicit owner approval.
- Do not delete the feature branch unless owner asks.
- Do not start Phase 4 runtime work before Phase 3 completion.
- Customer read authorization must stay `auth.uid()`-derived.
- Guest claim must require verified current identity + 64-character public token; route JSON may accept only `{publicToken}`.
- Customer DTOs remain curated and exclude all forbidden internals listed above.

## Resume point

**Current Phase 3 status:** Tasks 1-12 complete/reviewed. Exact runtime candidate `1f2432bd000e7e01201d0f2d632cac51399f86d0`, CI `33684404621`, job `100428283809`, full gates PASS.

**Phase 3 DB:** migration `202609020003_customer_accounts_orders.sql` exists in Git, reviewed, **NOT APPLIED**.

**NEXT EXACT ACTION:** ask the owner for explicit Task 13 approval to apply exactly `supabase/migrations/202609020003_customer_accounts_orders.sql` to the current ProxyBembem Supabase project. If approved, apply it once, verify history/schema/grants/RLS, run the plan's rollback-only 10-scenario customer isolation/claim matrix, prove zero synthetic fixtures remain, run Supabase advisors, record evidence, and then proceed to Task 14 Preview acceptance. Do not merge or promote Production.