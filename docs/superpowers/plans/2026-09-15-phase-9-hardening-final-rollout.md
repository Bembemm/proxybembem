# Phase 9 Hardening + Final Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit and safely harden the complete ProxyBembem system, correct objective findings without changing accepted business semantics, and produce the final CI-green rollout candidate with honest acceptance evidence.

**Architecture:** Keep the existing modular monolith. Add only targeted regression tests, bounded server-side corrections, additive Supabase migrations, and Phase 9 audit/evidence docs. Hosted changes are applied once and reconciled before rollout.

**Tech Stack:** Next.js 16.3.3, TypeScript 5.7.3, Node.js 22.x, Supabase/PostgreSQL/Auth/RLS, Mercado Pago, Melhor Envio, Resend, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-15-phase-9-hardening-final-rollout-design.md`

## Global constraints

- Work only on `feat/phase-9-hardening-final-rollout` until the owner explicitly approves integration.
- Phase 9 starts from Phase 8 candidate `773504f0e68220c1bda0ec706c4e62f8d542e433`; the inherited authenticated `/admin` smoke remains open until the owner can perform it.
- Never edit or reapply an already-hosted migration. Database corrections are additive only.
- Do not merge, squash, rebase, delete branches or force-move refs without explicit owner approval.
- Stop for owner approval before any change that materially alters checkout, payment/reversal semantics, order ownership, shipping purchase/cancellation, customer auth UX, admin MFA/session requirements, product lifecycle, public pricing/lead-time promises or destructive data behavior.
- Vercel runtime remains Node `22.1.0`; use `npx pnpm@10` and normal `umask 022`. Never build with `umask 077`.
- Never restart Production with PM2 CLI. Restart only through the Vercel dashboard.
- A security/advisor warning is not itself permission to change behavior. Prove the issue, then make the smallest safe correction.
- No completion/acceptance claim without fresh verification evidence.

---

## Task 1 — Build the Phase 9 audit matrix and executable security inventory

**Files:**
- Create: `docs/superpowers/phase-9/AUDIT_MATRIX.md`
- Create: `tests/phase9-security-inventory.test.ts`
- Read/reuse: existing auth, checkout, customer, admin-product, Store Settings, shipment, notification and dashboard tests.

- [ ] **Step 1: Write the audit matrix skeleton from the approved spec**

Use one row per domain with only these dispositions: `PASS`, `FIX REQUIRED`, `HOSTED CHECK`, `OWNER SMOKE PENDING`. Record the evidence path and why the disposition is justified. Include at minimum:

```md
| Domain | Disposition | Evidence / next proof |
| --- | --- | --- |
| Admin auth + AAL2 + app session | PASS or FIX REQUIRED | `tests/admin-auth*.test.ts` + source review |
| Customer ownership/isolation | PASS or FIX REQUIRED | customer profile/order/shipment tests |
| Origin/CSRF mutation boundaries | PASS or FIX REQUIRED | route inventory + same-origin tests |
| Cache/no-store | PASS or FIX REQUIRED | protected route tests + final manual header observation |
| Rate limits/abuse | PASS or FIX REQUIRED | `lib/server/rate-limit.ts` + route wiring |
| Secret/browser boundary | PASS or FIX REQUIRED | env/client-import/log scan |
| Supabase RLS/grants/functions | HOSTED CHECK | hosted schema/advisors |
| Supabase Auth leaked-password protection | HOSTED CHECK | hosted Auth settings |
| `customer_profiles` RLS initplan | FIX REQUIRED | hosted advisor + migration contract |
| Index review | HOSTED CHECK | index definitions/usage/query evidence |
| Concurrency/idempotency | PASS or FIX REQUIRED | matrix + focused regressions |
| Phase 4 historical smoke | OWNER SMOKE PENDING | final manual smoke |
| Phase 8 authenticated dashboard smoke | OWNER SMOKE PENDING | final manual smoke |
```

Do not mark a domain `PASS` merely because a nearby test exists; inspect the route/repository boundary named by the spec.

- [ ] **Step 2: Add a source-contract test for final invariants**

Create `tests/phase9-security-inventory.test.ts`. It should read the authoritative source/tests and assert the invariant remains wired. Keep it static and narrow rather than duplicating every behavior test. Example core shape:

```ts
import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

async function exists(path: string) {
  try {
    await access(new URL(path, import.meta.url))
    return true
  } catch {
    return false
  }
}

test("final hardening keeps admin AAL2 and active app-session authorization", async () => {
  const auth = await source("../lib/server/admin-auth.ts")
  assert.match(auth, /requireAal2:\s*true/)
  assert.match(auth, /authorizeSession/)
  assert.match(auth, /fresh_login_required/)
})

test("final hardening keeps guest order surfaces retired", async () => {
  for (const path of [
    "../app/pedido/[token]/page.tsx",
    "../app/api/account/orders/claim/route.ts",
    "../lib/server/customer-order-claim.ts",
  ]) {
    assert.equal(await exists(path), false)
  }
})
```

Also assert:
- checkout still requires trusted verified customer identity;
- customer profile repository still uses authenticated SSR/RLS, not service-role ownership bypass;
- admin product/settings/image mutations retain touched admin auth and same-origin boundaries;
- shipment purchase remains explicit/fail-closed and not reachable from render/tracking/webhook paths;
- dashboard remains server/read-only and fails visibly rather than synthetic zeros;
- client-side auth/admin components contain no server secret identifiers.

- [ ] **Step 3: Run the new inventory test**

```bash
node --experimental-strip-types --test tests/phase9-security-inventory.test.ts
```

Expected: GREEN for already-established invariants. If it fails because a real invariant is absent, record that row as `FIX REQUIRED`; do not weaken the test to make it pass.

- [ ] **Step 4: Run the focused existing security suites**

```bash
node --experimental-strip-types --test \
  tests/admin-auth-core.test.ts \
  tests/admin-auth.test.ts \
  tests/admin-auth-ui.test.ts \
  tests/customer-account-actions.test.ts \
  tests/customer-profile.test.ts \
  tests/private-order-only.test.ts \
  tests/checkout-route.test.ts \
  tests/admin-product-routes.test.ts \
  tests/admin-product-images.test.ts \
  tests/admin-dashboard-ui.test.ts \
  tests/rate-limit.test.ts \
  tests/password-recovery-flow.test.ts
```

- [ ] **Step 5: Update the matrix from evidence and commit**

```bash
git add docs/superpowers/phase-9/AUDIT_MATRIX.md tests/phase9-security-inventory.test.ts
git commit -m "test: establish Phase 9 security audit baseline"
```

---

## Task 2 — Fix the known `customer_profiles` RLS initplan warnings without changing ownership semantics

**Files:**
- Create: `tests/phase9-customer-profiles-rls.test.ts`
- Create: `supabase/migrations/202609150002_phase9_customer_profiles_rls_performance.sql`
- Do not modify: `supabase/migrations/202609020003_customer_accounts_orders.sql`

- [ ] **Step 1: Write the RED migration contract**

The test must fail while the new migration does not exist and then verify the exact semantics after creation:

```ts
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = new URL(
  "../supabase/migrations/202609150002_phase9_customer_profiles_rls_performance.sql",
  import.meta.url,
)

test("customer profile policies use initplan-safe auth uid without changing grants", async () => {
  const sql = await readFile(migration, "utf8")

  for (const policy of [
    "customer_profiles_select_own",
    "customer_profiles_insert_own",
    "customer_profiles_update_own",
  ]) {
    assert.match(sql, new RegExp(`create\\s+policy\\s+${policy}`, "i"))
  }

  assert.match(sql, /\(select\s+auth\.uid\(\)\)\s*=\s*id/i)
  assert.doesNotMatch(sql, /grant\s+.*customer_profiles/i)
  assert.doesNotMatch(sql, /alter\s+table\s+public\.customer_profiles\s+disable\s+row\s+level\s+security/i)
})
```

Run:

```bash
node --experimental-strip-types --test tests/phase9-customer-profiles-rls.test.ts
```

Expected: RED because the migration is not present yet.

- [ ] **Step 2: Add the minimal additive migration**

Create exactly:

```sql
drop policy if exists customer_profiles_select_own on public.customer_profiles;
create policy customer_profiles_select_own
on public.customer_profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists customer_profiles_insert_own on public.customer_profiles;
create policy customer_profiles_insert_own
on public.customer_profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists customer_profiles_update_own on public.customer_profiles;
create policy customer_profiles_update_own
on public.customer_profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
```

Do not alter table grants or authenticated CRUD shape in this migration.

- [ ] **Step 3: Run focused tests GREEN**

```bash
node --experimental-strip-types --test \
  tests/phase9-customer-profiles-rls.test.ts \
  tests/customer-profile.test.ts \
  tests/customer-account-actions.test.ts
```

- [ ] **Step 4: Commit the RLS correction**

```bash
git add tests/phase9-customer-profiles-rls.test.ts supabase/migrations/202609150002_phase9_customer_profiles_rls_performance.sql
git commit -m "fix: optimize customer profile rls policies"
```

---

## Task 3 — Audit route origin, cache, rate-limit and secret boundaries; fix only proven gaps

**Files:**
- Create: `tests/phase9-route-security.test.ts`
- Modify only when a failing regression proves a gap: route/helper files under `app/api/**` and `lib/server/**`
- Likely review targets: `lib/server/rate-limit.ts`, `lib/server/admin-auth.ts`, `lib/server/customer-account-actions.ts`, `lib/server/admin-product-actions.ts`, `lib/server/product-images.ts`, `lib/server/admin-store-settings-actions.ts`, checkout/account/admin shipment routes, notification worker/resend routes.

- [ ] **Step 1: Inventory mutation routes**

List sensitive `POST`, `PATCH`, and state-changing routes. For each, record in `AUDIT_MATRIX.md`:
- authority used;
- same-origin/signature/cron-secret control;
- body bound;
- rate limit or stronger provider-specific replay/idempotency control;
- `private, no-store` response behavior where private/session-bound.

Provider webhooks must not receive a naive per-IP limiter that could break legitimate retries; signed/idempotent provider callbacks can be documented as protected by signature + dedupe instead.

- [ ] **Step 2: Add one route-security contract test**

The test should statically cover categories, not every branch of every handler. Required assertions:
- account mutations use `isSameOriginAccountRequest` and bounded JSON bodies;
- checkout uses its existing origin/auth/rate-limit boundaries;
- admin products/images/settings use touched admin auth and same-origin;
- shipment mutations use admin auth plus correct spend/mutation rate-limit scopes;
- notification resend/worker routes require their intended admin/cron authority;
- protected JSON responses use no-store;
- raw server secret names do not appear in `"use client"` files.

- [ ] **Step 3: Run the route-security test and classify failures**

```bash
node --experimental-strip-types --test tests/phase9-route-security.test.ts
```

For each failure:
1. confirm it is a real missing control rather than an alternate equivalent control;
2. if real, keep the test RED;
3. implement the smallest fix;
4. rerun the focused test GREEN;
5. commit that finding separately, e.g. `fix: rate limit admin settings mutations`.

Do not bundle unrelated findings into one implementation commit.

- [ ] **Step 4: Re-run the existing route suites**

```bash
node --experimental-strip-types --test \
  tests/customer-account-actions.test.ts \
  tests/checkout-route.test.ts \
  tests/admin-auth-ui.test.ts \
  tests/admin-product-routes.test.ts \
  tests/admin-product-images.test.ts \
  tests/admin-shipment-actions.test.ts \
  tests/shipment-security-regression.test.ts \
  tests/shipment-post-cancel-routes.test.ts \
  tests/shipment-print-routes.test.ts \
  tests/melhor-envio-oauth-routes.test.ts \
  tests/password-recovery-flow.test.ts \
  tests/rate-limit.test.ts
```

---

## Task 4 — Audit Supabase grants, `SECURITY DEFINER` functions and indexes

**Files:**
- Create: `docs/superpowers/phase-9/SUPABASE_AUDIT.md`
- Create: `tests/phase9-supabase-hardening.test.ts`
- Create an additional additive migration only if an actual DB defect is demonstrated.

- [ ] **Step 1: Build a repository-level function/grant contract**

The test should scan migrations for active privileged RPC definitions and assert the intended patterns where applicable:
- `SECURITY DEFINER` functions have fixed `search_path = ''`;
- service-only administrative RPCs revoke public/anon/authenticated execute and grant service role only;
- customer RPCs that intentionally execute as `authenticated` remain owner-scoped through `auth.uid()` and do not accept a caller-controlled customer UUID as authority;
- Phase 8 dashboard RPC remains service-role-only/read-only from application perspective.

Do not mechanically fail merely because `customer_list_orders` or `customer_get_order` are authenticated `SECURITY DEFINER`; their authenticated execution is part of the private customer contract and must be evaluated semantically.

- [ ] **Step 2: Record every hosted advisor finding with a disposition**

`SUPABASE_AUDIT.md` must have columns:

```md
| Finding | Object | Severity | Disposition | Evidence/reason |
```

Allowed dispositions: `FIX`, `KEEP_INTENTIONAL`, `KEEP_UNPROVEN`, `PLATFORM_LIMITATION`, `RESOLVED`.

- [ ] **Step 3: Review unused indexes before any removal**

For each hosted unused-index finding, verify all of:
- index DDL/uniqueness;
- constraint/FK relationship;
- repository/RPC predicates and ordering;
- whether another index fully subsumes it;
- hosted `pg_stat_user_indexes` usage/size evidence when available.

Only if all evidence proves redundancy, create a dedicated additive migration that drops that exact index and a regression test documenting why it is safe. Otherwise keep it and record the reason. Do not remove indexes merely to make the advisor list shorter.

- [ ] **Step 4: Run the repository hardening contract**

```bash
node --experimental-strip-types --test tests/phase9-supabase-hardening.test.ts
```

Commit the audit artifact/test after repository review; commit any actual DDL correction separately.

---

## Task 5 — Build and verify the concurrency/idempotency matrix

**Files:**
- Create: `docs/superpowers/phase-9/CONCURRENCY_MATRIX.md`
- Create: `tests/phase9-concurrency-contract.test.ts`
- Modify implementation only if a proven hole exists and it does not cross the owner-approval boundary.

- [ ] **Step 1: Document each critical flow**

The matrix must contain these rows:
1. Mercado Pago webhook/payment state application;
2. payment preference creation/lease;
3. fulfillment transitions;
4. product optimistic concurrency;
5. Store Settings optimistic concurrency;
6. shipment prepare/purchase/generate/post/cancel/reconciliation;
7. notification outbox claim/send/provider webhook/manual resend;
8. password recovery grant claim/finalize;
9. attention flag open/resolve lifecycle;
10. dashboard snapshot read consistency.

For every row record:

```md
| Flow | Authority | Dedupe/idempotency key | Lock/version/lease | Safe retry | Ambiguous-provider handling | Test evidence |
```

- [ ] **Step 2: Add a static concurrency contract**

The new test should assert the key mechanisms remain present in the authoritative source/migrations: payment event dedupe keys, preference lease, optimistic `expectedUpdatedAt`, shipment operation/version handling, notification provider idempotency key, recovery grant lease, attention partial uniqueness/resolution, and single dashboard `as_of`.

- [ ] **Step 3: Run focused concurrency suites**

Use existing tests that exercise these mechanisms, including payment/order, product, shipment, notification, recovery and dashboard suites. If a real hole appears, write a behavioral RED regression before changing code.

- [ ] **Step 4: Stop if the fix changes business semantics**

If a concurrency correction would change what counts as payment approval/reversal, shipment purchase/cancel behavior, ownership, customer auth UX, or product lifecycle, do not implement it until the owner approves that specific behavior change.

---

## Task 6 — Convert historical Phase 4 and Phase 8 acceptance debt into one deterministic final smoke

**Files:**
- Create: `docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md`
- Create: `tests/phase9-final-acceptance-contract.test.ts`

- [ ] **Step 1: Write the manual smoke checklist**

The document must separate automated evidence from owner-observed manual evidence. Include:

**Phase 4 product admin debt**
- create a draft product;
- edit it;
- publish it;
- confirm public catalog visibility;
- archive it and confirm public removal;
- reactivate according to lifecycle contract;
- protected image upload;
- stale two-tab edit conflict;
- cache/catalog propagation.

**Phase 8 inherited dashboard debt**
- authenticated `/admin` loads without the unavailable/synthetic-zero fallback;
- Orders / Aprovado bruto / Revertido cards render;
- current fulfillment and financial-risk queues render;
- Attention Center totals/top links and `/admin/pedidos?attention=1` work;
- no raw attention metadata appears;
- monthly product ranking renders;
- Melhor Envio utility remains accessible;
- authenticated private response header/cache behavior is observed.

**Final Phase 9 smoke**
- customer private order ownership;
- checkout verified-auth start;
- admin MFA/session boundary;
- Store Settings save/conflict/public propagation;
- shipping safe state with auto-spend disabled outside deliberate purchase windows;
- transactional notification path;
- public site HTTP health.

Keep Phase 8 rows marked `PENDING OWNER SMOKE` until the owner actually performs them.

- [ ] **Step 2: Add an acceptance-contract test**

The test should ensure the final smoke doc references existing automated suites such as `admin-product-routes.test.ts`, `admin-product-images.test.ts`, `admin-dashboard-ui.test.ts`, `private-order-only.test.ts`, and keeps the Phase 8 manual state explicitly pending unless `FINAL_ACCEPTANCE.md` later contains actual owner evidence.

- [ ] **Step 3: Run focused acceptance-contract tests**

```bash
node --experimental-strip-types --test \
  tests/phase9-final-acceptance-contract.test.ts \
  tests/admin-product-routes.test.ts \
  tests/admin-product-images.test.ts \
  tests/admin-dashboard-ui.test.ts \
  tests/private-order-only.test.ts
```

---

## Task 7 — Apply and validate Phase 9 hosted Supabase hardening

**Files:**
- Create after real hosted evidence exists: `docs/superpowers/phase-9/HOSTED_VALIDATION.md`

- [ ] **Step 1: Read hosted migration history before writes**

Confirm the Phase 8 hosted migration `20260915092352 dashboard_metrics_attention_center` is already present. Do not reapply Phase 7 or Phase 8 migrations.

- [ ] **Step 2: Apply only the new Phase 9 migration(s) once**

At minimum, if Task 2 is still the only required DDL, apply only the repository SQL from:

`supabase/migrations/202609150002_phase9_customer_profiles_rls_performance.sql`

Record the hosted-assigned version/name returned by Supabase.

- [ ] **Step 3: Reconcile RLS semantics**

Verify hosted policy expressions use `(select auth.uid()) = id` for select/insert/update, RLS remains enabled, and authenticated grants are unchanged. Perform read-only or rollback-only checks; do not leave synthetic user/business rows behind.

- [ ] **Step 4: Re-run security and performance advisors**

Expected objective outcome: the three known `customer_profiles` `auth_rls_initplan` warnings are gone. Review every remaining finding; do not equate pre-existing intentional INFO/WARN findings with a Phase 9 regression.

- [ ] **Step 5: Evaluate leaked-password protection**

Inspect hosted Supabase Auth settings. Enable leaked-password protection only if the hosted project/account supports it and activation is safe for the current user flow. If it cannot be safely enabled because of plan/platform/compatibility constraints, record exactly that limitation. Never claim it is enabled without hosted verification.

- [ ] **Step 6: Verify privileged function/grant state and index evidence**

Check `SECURITY DEFINER`, fixed search paths, execute grants, RLS/browser-role exposure, and the six previously reported unused-index findings. Apply no index change without the Task 4 evidence gate.

- [ ] **Step 7: Write hosted validation evidence and commit**

The document must state exactly what was independently verified, what is owner-reported, what remains informational, and the hosted migration version(s). Do not include secrets or raw customer data.

---

## Task 8 — Produce one final automated candidate and reconcile canonical documentation

**Files:**
- Modify: `docs/superpowers/CURRENT_STATUS.md`
- Modify: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- Modify: `docs/PROJECT_MASTER_OVERVIEW.md`
- Preserve: `tests/phase5-shipping-docs.test.ts` historical evidence expectations.

- [ ] **Step 1: Run the exact local/CI-equivalent verification**

```bash
nvm use 22.1.0
npx pnpm@10 install --frozen-lockfile
npx pnpm@10 typecheck
npx pnpm@10 build
npx pnpm@10 test
```

Also run the same private-order route contract and Vercel runtime checks used by `.github/workflows/ci.yml` if they are separate from `pnpm test`/build.

Expected: all commands exit 0. Do not infer success from an earlier run.

- [ ] **Step 2: Reconcile the canonical status docs**

Record:
- Phase 8 migration is hosted/validated and candidate was deployed;
- Phase 8 authenticated `/admin` smoke remains pending unless the owner has since completed it;
- Phase 9 audit domains and dispositions;
- Phase 9 hosted migration/version and advisor result;
- leaked-password protection actual hosted state;
- retained index/advisor findings with rationale;
- exact candidate SHA and CI run after it exists.

Preserve the Phase 5 evidence required by `tests/phase5-shipping-docs.test.ts`, including `non-spending/sem gasto`, `in_cart`, `R$ 23,69`, Task 18 owner-accepted/owner-reported, `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false`, Task 19, Task 20 and all Phase 5 migration names.

- [ ] **Step 3: Run docs-sensitive tests again**

```bash
node --experimental-strip-types --test \
  tests/phase5-shipping-docs.test.ts \
  tests/phase9-final-acceptance-contract.test.ts
```

- [ ] **Step 4: Commit the candidate checkpoint and require exact-SHA CI**

After the docs commit, obtain the exact branch HEAD and wait for GitHub Actions. The candidate is eligible for Production only when that exact SHA passes the full workflow: Node.js 22.x, frozen install, typecheck, Vercel build, private-order route contract, startup smoke and full test suite.

Do not call the project `Production accepted` merely because CI is green.

---

## Task 9 — Final Vercel rollout and truthful project acceptance

**Files:**
- Create only after real final evidence exists: `docs/superpowers/phase-9/FINAL_ACCEPTANCE.md`

- [ ] **Step 1: Preflight the exact CI-green candidate on Vercel**

Before changing checkout state:

```bash
cd ~/apps_nodejs/proxybembem
git status -sb
umask
git fetch origin feat/phase-9-hardening-final-rollout
```

Stop on unknown local modifications. Require normal `0022`/`022` umask.

- [ ] **Step 2: Checkout the exact final branch HEAD verified by CI**

Resolve the SHA from the already-green branch head and pin it:

```bash
FINAL_SHA="$(git rev-parse FETCH_HEAD)"
git switch --detach "$FINAL_SHA"
git rev-parse HEAD
```

The printed HEAD must equal the exact SHA whose CI evidence was reviewed in Task 8.

- [ ] **Step 3: Build/deploy with the canonical runtime**

```bash
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 build
```

Only after successful build/publish, restart from the Vercel dashboard. Never use `pm2 start`, `pm2 restart`, or other PM2 CLI operations.

- [ ] **Step 4: Run public smoke**

```bash
curl -sSI https://www.proxybembem.com.br/ | head -n 8
git rev-parse HEAD
git status -sb
```

Require public HTTP success and the exact candidate SHA.

- [ ] **Step 5: Run the owner-authenticated final manual smoke when available**

Use `docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md`. This includes the inherited Phase 8 `/admin` gate and the historical Phase 4 product-admin gate. Do not replace owner interaction with assumptions.

- [ ] **Step 6: Write final acceptance honestly**

Create `docs/superpowers/phase-9/FINAL_ACCEPTANCE.md` only after the evidence it describes exists.

If automated/hosted work is complete but owner smoke still cannot be performed, the correct final state is:

`PHASE 9 IMPLEMENTATION COMPLETE / HOSTED VALIDATED / ROLLOUT EVIDENCE PENDING`

and the overall project is not yet labeled fully Production-accepted.

If all manual gates pass, record exact runtime SHA, CI run, hosted versions, public smoke, owner-observed checks and any retained advisor findings. Distinguish independently observed evidence from owner-reported evidence.

- [ ] **Step 7: Keep integration a separate explicit decision**

Do not merge the Phase 8/9 lineage into `main`, delete branches, force-move refs, squash or rebase unless the owner explicitly approves that action after final evidence.
