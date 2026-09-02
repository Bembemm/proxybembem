# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then `docs/superpowers/plans/2026-09-02-customer-account-orders.md` before making changes. Detailed intermediate evidence remains in Git history; this file records the current no-rediscovery state and exact resume action.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- State: **PHASE 1 COMPLETE/APPLIED; PHASE 2 COMPLETE/APPLIED/PREVIEW ACCEPTED; PHASE 3 TASKS 1-13 COMPLETE/APPLIED/DB-VALIDATED; TASK 14 AUTOMATED ACCEPTANCE IN PROGRESS / OWNER AUTH FLOW PENDING**
- Phase 3 migration application: **APPROVED / APPLIED / VALIDATED**
- Merge/new Production application deployment: **NOT APPROVED**

## Applied baseline — do not rediscover or reapply

Phase 1 data/audit foundation and Phase 2 admin orders/fulfillment are already applied and validated on the current ProxyBembem Supabase project. Phase 2 migration is recorded as `20260902160658_admin_order_fulfillment_operations`; rollback validation left zero synthetic order/event/attention/audit rows. Phase 2 Preview was owner-accepted with normal password + TOTP admin authentication.

Phase 3 is now database-compatible on the current project. Do not reapply Phase 1/2/3 migrations. Do not merge, promote, or delete the feature branch without explicit owner permission.

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

## Phase 3 reviewed runtime candidates

Pre-DDL reviewed runtime candidate: `1f2432bd000e7e01201d0f2d632cac51399f86d0`.

CI `33684404621`, job `100428283809`:

- `pnpm test`: **359/359 PASS / 0 FAIL**;
- all eight `customer-account-security.test.ts` cases PASS;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS, 28/28 static pages;
- Task 12 full diff/security review found no runtime defect requiring application-code changes.

Task 14 Preview acceptance found an App Router protected-page regression/noise issue after DDL compatibility: the protected layout redirected anonymous users correctly, but child Server Components could begin private reads concurrently before the layout redirect completed. This produced Preview errors such as `Customer profile access requires authentication` and `Customer order storage request failed` even though no customer data was exposed.

TDD regression evidence:

- RED commit: `b0017ea6d3606d478b221566268a2b17ff9480e7`;
- RED CI `33689243076`, job `100443906774`: **360 tests / 359 PASS / exactly 1 FAIL**, only the new page-auth regression test;
- GREEN page gates added before private reads in `/minha-conta`, `/minha-conta/pedidos`, `/minha-conta/pedidos/[id]`, and `/minha-conta/perfil`;
- current GREEN runtime candidate: `14a6f337892876e47680a3c13fa671602b6e584e`;
- GREEN CI `33689402542`, job `100444410430`: **360/360 PASS / 0 FAIL**, `pnpm typecheck` PASS, `pnpm build` PASS, 28/28 static pages;
- `customer-account-page-auth.test.ts`: PASS, proving each protected customer page gates authentication before its customer-data read.

Relevant earlier final candidates:

- Task 2 migration Git candidate `032c65102c9204688fb51937a250bf98a0dd1795`;
- Task 3 mandatory checkout email `70319add3f2a8c139b25fdb4ca5a3fefd80b14d9`;
- Task 4 customer auth boundary `e88ddbe84f89c48024856d7d53bad27ff45240cb`;
- Task 5 checkout ownership `fc3007ae3ad5f20c8a9397de3131cb1c5f39eea6`;
- Task 6 customer profiles `bc66eaf932b5dc3c710813cce8c3abd503cc6b1d`;
- Task 7 account actions `85bb1d880684e14ffbdb18fd66b875d6e8c5a2`;
- Task 8 owned-order repository `126158df19cc51f97154006f830ad31222ce8e89`;
- Task 9 secure claim `c8e836cf69de086d2000d0fc9904af9b24d2307b`;
- Task 10 customer UI `a8cda3d929e0af86810137f423c0ce625f448391`.

## Task 13 — Phase 3 Supabase application/validation COMPLETE

Owner explicitly approved continuing from the Task 13 DDL gate on 2026-09-02.

Applied exact reviewed Git migration:

- file: `supabase/migrations/202609020003_customer_accounts_orders.sql`;
- current Supabase project: `ProxyBembem`;
- Supabase migration history entry: `20260902220354_customer_accounts_orders`;
- application result: SUCCESS.

Post-application structure/grant/RLS proof:

- `orders.customer_email`: present;
- `orders.customer_id`: present, FK to `auth.users(id)`;
- `customer_profiles`: present with RLS enabled;
- authenticated profile grants: SELECT/INSERT/UPDATE yes, DELETE no;
- `customer_list_orders`: present; authenticated EXECUTE yes;
- `customer_get_order`: present; authenticated EXECUTE yes;
- `claim_guest_order_for_customer`: present; authenticated EXECUTE no; anon EXECUTE no; service_role EXECUTE yes.

Historical-integrity proof immediately after application:

- total existing orders: **25**;
- existing orders with non-null Phase 3 identity (`customer_email` or `customer_id`): **0**;
- therefore no historical email/customer ownership was fabricated by migration application.

Rollback-only 10-scenario matrix: **10/10 PASS**.

1. customer A list sees A only;
2. customer A detail cannot see B;
3. guest new-order shape supports email + null owner;
4. authenticated-order shape supports email + owner;
5. correct verified email + token claim succeeds;
6. replay returns `already_claimed` and does not duplicate the claim event;
7. wrong verified email + valid token is `not_claimable`;
8. historical null-email order is `not_claimable`;
9. already-owned-by-other order is `not_claimable`;
10. customer list/detail RPC payloads contain none of the forbidden internal fields.

Fixture cleanup proof after rollback:

- Task 13 synthetic orders: **0**;
- synthetic customer profiles: **0**;
- synthetic claim events: **0**;
- synthetic Auth users: **0**;
- real order count remained **25**;
- real orders with Phase 3 identity remained **0**.

### Supabase advisors after DDL

Security advisor classification:

- existing INFO `rls_enabled_no_policy` notices on private/fail-closed tables such as `orders`, `order_events`, `admin_sessions`, `admin_audit_log`, rate-limit/OAuth/attention tables: expected existing architecture, not a new Phase 3 exposure;
- WARN for authenticated execution of `SECURITY DEFINER` `customer_list_orders` and `customer_get_order`: **intentional Phase 3 design**. The functions are narrow RPCs, use fixed empty search path, derive ownership from `auth.uid()`, return curated JSON, and direct broad authenticated SELECT on `orders` was not granted;
- WARN `auth_leaked_password_protection`: project-level Supabase Auth setting, not introduced by the Phase 3 migration. Treat as a separate Auth-hardening consideration, not a Task 13 correctness blocker.

Performance advisor classification:

- WARN `auth_rls_initplan` on the three `customer_profiles` own-row policies because they use direct `auth.uid()` instead of `(select auth.uid())`: performance-only optimization opportunity; authorization behavior is correct and the Task 13 matrix passed. Do not silently change the reviewed migration/runtime contract during Task 13;
- INFO unused admin audit index: pre-existing/usage-dependent and unrelated to Phase 3 correctness.

## Task 14 — Preview acceptance IN PROGRESS

Automated evidence already completed:

- READY Preview at docs-only descendant `07fd09835b124e42cd028df0e39ed82adb780942` after Phase 3 DDL compatibility returned 200 for `/` and `/produtos`;
- invalid 64-character public token tracking returned a safe 404/noindex response;
- unauthenticated `/minha-conta` and `/minha-conta/pedidos` redirected to `/entrar` and exposed no customer orders;
- checkout tests confirm an accessible required email field and normalized mandatory email validation;
- checkout route source validates/parses the customer, including email, and returns 400 on field errors **before** entering the block that resolves environment/customer identity and calls `executeCheckoutFlow`, so missing/invalid guest email cannot initiate Mercado Pago preference creation;
- the initial Preview log review exposed the protected-child read race described above; TDD GREEN is now `14a6f337...` with 360/360 CI.

Current deployment gate:

- as of this checkpoint, Vercel had not yet emitted a new deployment newer than the RED Preview `b0017ea6...`; querying deployments strictly after that deployment timestamp returned zero results;
- therefore runtime log regression verification for GREEN `14a6f337...` is still pending and must not be claimed complete until a READY Preview for that SHA or a docs-only descendant exists;
- do not manually promote Production to satisfy this gate.

Owner/manual acceptance still required by the Phase 3 plan after the automated smoke:

1. owner creates/uses a test customer through the normal Supabase Auth verification flow; credentials/passwords/codes are never shared in chat;
2. verify login, `/minha-conta`, own orders, own detail, profile and security page;
3. verify a second account cannot access the first account's order by copied UUID;
4. verify guest claim using a deliberately created safe test order only, with no real Mercado Pago payment;
5. review Preview error/fatal logs after those checks.

## Current safety gates

- Phase 3 DDL is **APPLIED and validated**; do not reapply it.
- Task 14 Preview acceptance is **in progress**, not complete.
- Current GREEN runtime candidate is `14a6f337892876e47680a3c13fa671602b6e584e`.
- Do not merge `feat/admin-dashboard-expansion` without explicit owner approval.
- Do not create/promote a new Production application deployment without explicit owner approval.
- Do not delete the feature branch unless owner asks.
- Do not start Phase 4 runtime work before Phase 3 completion.
- Customer read authorization must stay `auth.uid()`-derived.
- Guest claim must require verified current identity + 64-character public token; route JSON may accept only `{publicToken}`.
- Customer DTOs remain curated and exclude all forbidden internals listed above.

## Resume point

**Current Phase 3 status:** Tasks 1-13 complete. Task 14 automated acceptance is partially complete; the anonymous protected-page race was found and fixed by TDD. GREEN candidate `14a6f337892876e47680a3c13fa671602b6e584e` has 360/360 tests, typecheck PASS and build PASS (28/28 pages).

**Phase 3 DB:** `20260902220354_customer_accounts_orders` is applied to the current ProxyBembem Supabase project and validated with 10/10 rollback-only matrix + zero fixture residue.

**NEXT EXACT ACTION:** Wait only for Vercel's normal Git Preview pipeline to expose a READY deployment for `14a6f337...` or this docs-only descendant; then repeat `/`, `/produtos`, invalid-token and unauthenticated customer-route smoke and confirm the earlier customer profile/order errors are absent from that deployment's error/fatal logs. After that, stop at the explicit owner-auth acceptance step: owner must create/use the test customer through normal Supabase verification without sharing credentials, then perform the account/cross-account/guest-claim checks. No merge or Production promotion.