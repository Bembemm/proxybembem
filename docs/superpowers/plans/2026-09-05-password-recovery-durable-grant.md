# Durable Password Recovery Grant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scanner-safe password recovery flow retry-safe across process/gateway failures without exposing recovery credentials or depending on a consumed Supabase OTP session.

**Architecture:** Issue an application-owned 256-bit recovery token after server-side Supabase account resolution, store only an HMAC-backed grant in Postgres, and use a short atomic lease plus server-only `auth.admin.updateUserById` on final submit. The browser keeps only the existing HttpOnly recovery cookie; successful completion consumes the grant.

**Tech Stack:** Next.js 16.3.3, Node.js 22.x, TypeScript, `@supabase/supabase-js` 2.112.4, PostgreSQL/Supabase RPC, Resend, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-05-password-recovery-durable-grant-design.md`

## Global Constraints

- Branch: `feat/admin-dashboard-expansion`; do not start Phase 4.
- Do not reapply Phase 1/2/3 migrations.
- Keep same-origin checks, 4096-byte body limits and existing account recovery rate limits.
- Never log email, password, raw recovery token, HMAC grant key, cookies, access/refresh tokens, Supabase secret or Resend key.
- Recovery responses controlled by the app remain `Cache-Control: private, no-store`.
- Recovery cookie remains host-only, HttpOnly, SameSite=Lax, Path=/, Secure in production.
- Server runtime remains exact Node.js 22.x on Vercel.

---

### Task 1: Add RED regression coverage for application recovery grants

**Files:**
- Create: `tests/password-recovery-durable-grant.test.ts`
- Modify later: `tests/password-recovery-flow.test.ts`

**Interfaces:**
- Consumes existing recovery routes/helpers.
- Produces failing expectations for `createPasswordRecoveryToken`, `derivePasswordRecoveryGrantKey`, durable grant RPC use, and admin password update.

- [ ] **Step 1: Write the failing unit/source-contract tests**

Add tests that import `../lib/server/password-recovery-grant.ts`, assert a generated token is exactly 43 Base64URL characters, assert deterministic 64-character lowercase-hex HMAC derivation, and source-check that reset issuance calls `issuePasswordRecoveryGrant` before `sendPasswordRecoveryEmail` while final recovery calls `claimPasswordRecoveryGrant`, `auth.admin.updateUserById`, `finishPasswordRecoveryGrant`, and does not call `verifyOtp`/`getClaims`/`getUser`.

- [ ] **Step 2: Run CI/test and verify RED**

Run the repository test suite/CI. Expected: the new helper import or new source expectations fail while typecheck/build remain otherwise healthy.

- [ ] **Step 3: Commit RED**

Commit message: `test: reproduce non-retryable password recovery submit`.

---

### Task 2: Add the durable recovery grant migration

**Files:**
- Create: `supabase/migrations/202609050001_password_recovery_grants.sql`
- Test: `tests/password-recovery-durable-grant.test.ts`

**Interfaces:**
- Produces RPCs:
  - `issue_password_recovery_grant(p_grant_key text, p_user_id uuid, p_ttl_seconds integer) -> void`
  - `claim_password_recovery_grant(p_grant_key text, p_lease_id uuid, p_lease_seconds integer, p_retry_window_seconds integer) -> table(status text, user_id uuid)`
  - `finish_password_recovery_grant(p_grant_key text, p_lease_id uuid, p_success boolean) -> boolean`

- [ ] **Step 1: Extend RED tests with migration security contracts**

Assert the migration creates `public.password_recovery_grants`, enables RLS, revokes direct table access from `public`, `anon`, `authenticated`, and `service_role`, uses `SECURITY DEFINER` with `set search_path = ''`, and grants RPC execution only to `service_role`.

- [ ] **Step 2: Run tests and verify migration expectations fail**

Expected: missing migration/file contracts fail.

- [ ] **Step 3: Implement the migration**

Create a table with `grant_key`, `user_id`, `created_at`, `expires_at`, `lease_id`, `lease_expires_at`, `consumed_at`, and `revoked_at`; enforce 64 lowercase-hex grant keys and coherent lease columns. `issue_password_recovery_grant` revokes prior outstanding grants for the same user and inserts a new max-3600-second grant. `claim_password_recovery_grant` locks the row, returns `invalid` for missing/expired/revoked/consumed, `busy` for an active lease, otherwise writes the caller lease and shortens remaining expiry to at most the retry window. `finish_password_recovery_grant` consumes on success or releases the lease on failure.

- [ ] **Step 4: Run tests and verify GREEN for migration contracts**

Expected: migration source tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add durable password recovery grants`.

---

### Task 3: Implement recovery token/grant server helper

**Files:**
- Create: `lib/server/password-recovery-grant.ts`
- Modify: `lib/server/password-recovery.ts`
- Test: `tests/password-recovery-durable-grant.test.ts`

**Interfaces:**
- Produces:
  - `createPasswordRecoveryToken(): string`
  - `isValidPasswordRecoveryToken(value: unknown): value is string`
  - `derivePasswordRecoveryGrantKey(token: string, secret: string): string`
  - `issuePasswordRecoveryGrant({ token, userId }): Promise<void>`
  - `claimPasswordRecoveryGrant(token): Promise<{ status: "claimed"; userId: string; leaseId: string } | { status: "busy" | "invalid" }>`
  - `finishPasswordRecoveryGrant({ token, leaseId, success }): Promise<boolean>`
  - `createPasswordRecoveryAdminClient()` for the server-only Auth admin update.

- [ ] **Step 1: Implement minimal pure token/HMAC helpers**

Use `randomBytes(32).toString("base64url")`; validate exactly 43 URL-safe characters; derive HMAC-SHA256 using `RATE_LIMIT_SECRET` with domain prefix `proxybembem:password-recovery-grant:v1\0`.

- [ ] **Step 2: Implement service-role RPC wrappers**

Use `getRateLimitEnv()` for the existing strong server secret and Supabase server credentials, `createClient(..., { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }})`, `randomUUID()` for the lease, TTL 3600, lease 45 seconds, retry window 300 seconds.

- [ ] **Step 3: Run tests and verify pure/helper tests pass**

Expected: new helper tests pass without exposing secrets.

- [ ] **Step 4: Commit**

Commit message: `feat: add password recovery grant helper`.

---

### Task 4: Issue grants before sending recovery email

**Files:**
- Modify: `app/api/account/password-reset/route.ts`
- Test: `tests/password-recovery-durable-grant.test.ts`
- Modify: `tests/password-recovery-flow.test.ts`

**Interfaces:**
- Consumes `createPasswordRecoveryToken`, `issuePasswordRecoveryGrant`.
- Produces an app-owned recovery URL carrying only the application token.

- [ ] **Step 1: Update the reset route**

Keep `auth.admin.generateLink({ type: "recovery", email })` for server-side account resolution. Require `data.user.id`, create the app token, persist the grant, then build `/auth/confirm?token_hash=<app-token>&type=recovery` and send through Resend. Preserve privacy: non-system provider/account lookup errors remain generic `200`.

- [ ] **Step 2: Update token landing validation**

Change `/auth/confirm` and shared recovery token validation to accept the new exact application-token shape while keeping cookie flags/expiry unchanged.

- [ ] **Step 3: Run tests/typecheck**

Expected: reset/landing regression tests pass.

- [ ] **Step 4: Commit**

Commit message: `fix: issue retry-safe recovery links`.

---

### Task 5: Replace one-time `verifyOtp` submit with durable grant claim

**Files:**
- Modify: `app/api/account/password-recovery/route.ts`
- Test: `tests/password-recovery-durable-grant.test.ts`
- Modify: `tests/password-recovery-flow.test.ts`

**Interfaces:**
- Consumes `claimPasswordRecoveryGrant`, `finishPasswordRecoveryGrant`, `createPasswordRecoveryAdminClient`.
- Produces retryable final password updates with `200`, `400`, `401`, `409`, or `503` semantics.

- [ ] **Step 1: Remove browser recovery-session dependency**

Delete `createSupabaseRouteClient`, `verifyOtp`, recovery AMR/getClaims/getUser retry branches from this endpoint. Require the recovery token cookie for final submit.

- [ ] **Step 2: Claim grant then update password**

Map claim `invalid` -> clear cookie + `401`; `busy` -> preserve cookie + `409`; `claimed` -> call `auth.admin.updateUserById(userId, { password })`.

- [ ] **Step 3: Release or consume the grant**

On Auth update error, call `finishPasswordRecoveryGrant(... success:false)` and return `400` for provider 4xx or `503` for system/unknown errors. On Auth update success, call `finishPasswordRecoveryGrant(... success:true)`, clear cookie, and return `200`. If final consumption fails after password update, clear the browser cookie and return a safety `503` message stating the password changed but final recovery cleanup failed.

- [ ] **Step 4: Run tests/typecheck/build**

Expected: no final recovery source references to `verifyOtp`, `getClaims`, `getUser` or session `updateUser`; all recovery tests pass.

- [ ] **Step 5: Commit**

Commit message: `fix: make password recovery submit retry-safe`.

---

### Task 6: Improve client retry/error messaging and documentation

**Files:**
- Modify: `components/account/password-form.tsx`
- Modify: `docs/superpowers/CURRENT_STATUS.md`
- Modify: `docs/deployment/vercel.md` only if migration/deploy order needs clarification.
- Test: existing account/recovery tests.

**Interfaces:**
- Client continues consuming `{ ok, message }` JSON when present.

- [ ] **Step 1: Preserve server messages even for non-JSON gateway responses**

Keep the existing JSON message behavior and add explicit fallback copy for `409`, `429`, and `5xx` so users are told whether to wait/retry versus request a new recovery link.

- [ ] **Step 2: Update CURRENT_STATUS**

Record the production failure evidence, superseding durable-grant design, migration filename/status, CI evidence, and exact remaining Vercel acceptance steps. Do not mark Phase 3 Task 14 complete until end-to-end login succeeds.

- [ ] **Step 3: Run full verification**

Run exact Node.js 22.x CI path: frozen install, typecheck, `build`, startup smoke, full tests.

- [ ] **Step 4: Commit**

Commit message: `docs: checkpoint durable password recovery`.

---

### Task 7: Apply and validate the new migration, then deploy

**Files:**
- Database migration: `password_recovery_grants` only.
- No Phase 1/2/3 migrations are reapplied.

**Interfaces:**
- Requires the exact SQL from `supabase/migrations/202609050001_password_recovery_grants.sql`.

- [ ] **Step 1: Apply exactly one new migration**

Use the Supabase migration mechanism when available. If the connector is unavailable, stop before claiming database completion and provide the exact SQL/file for the user to apply once in Supabase SQL Editor.

- [ ] **Step 2: Validate database security/state**

Verify table exists, RLS is enabled, direct privileges are absent for browser roles, RPC execute is restricted to `service_role`, and no synthetic grant rows remain after validation.

- [ ] **Step 3: Deploy only after migration + CI green**

Vercel commands:

```bash
cd ~/apps_nodejs/proxybembem
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 build
git rev-parse HEAD
```

Restart through the Vercel dashboard/process authority.

- [ ] **Step 4: End-to-end acceptance**

Request exactly one new recovery email, open the newest app-domain link, submit a new password once, confirm `200`/login success, then verify a second submit/link reuse fails closed. Inspect logs without exposing credentials.
