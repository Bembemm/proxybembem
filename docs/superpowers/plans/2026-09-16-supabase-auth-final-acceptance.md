# Supabase Auth and Final Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maximize no-cost Supabase Auth security without breaking account flows, review Security Advisor findings, and perform the final hardening regression/acceptance gate.

**Architecture:** First align application password validation/error handling with the intended Auth policy, then change only supported free Supabase dashboard settings. Database findings are reviewed by intent rather than silenced with permissive RLS. Final acceptance combines repository CI gates, Security Advisor evidence and KingHost sandbox smoke; production remains untouched.

**Tech Stack:** Supabase Auth/Postgres/RLS, `@supabase/ssr`, Next.js account routes, Node test runner, KingHost sandbox, Mercado Pago sandbox, Melhor Envio sandbox.

**Spec:** `docs/superpowers/specs/2026-09-16-site-security-nonce-hardening-design.md`

## Global Constraints

- `Leaked Password Protection` is paid (Pro+) and is an accepted warning, not a blocker.
- Do not broaden RLS to make Advisor informational findings disappear.
- Do not enable Auth settings until the current application flow supports them.
- Production credentials/data and sandbox credentials/data remain isolated.
- Label purchase stays disabled in initial sandbox validation.

---

## File Structure

- Review/modify `lib/server/customer-account-actions.ts` and account forms only where current password policy/error mapping requires alignment.
- Modify relevant account tests: `tests/customer-auth.test.ts`, `tests/customer-account-actions.test.ts`, `tests/customer-signup-confirmation.test.ts`, `tests/password-recovery-flow.test.ts`.
- Create `docs/superpowers/phase-hardening/SUPABASE_AUTH_SECURITY.md`: exact dashboard settings/evidence and accepted paid warning.
- Create `docs/superpowers/phase-hardening/FINAL_ACCEPTANCE.md`: commands, Advisor classification and sandbox smoke evidence.
- No SQL migration is allowed unless a reviewed Advisor finding demonstrates an actual authorization defect.

### Task 1: Inventory current application password/auth behavior

**Files:**
- Read: `lib/server/customer-account-actions.ts`
- Read: `components/account/signup-form.tsx`
- Read: `components/account/password-reset-form.tsx`
- Read: password recovery components/actions
- Tests: existing customer auth/recovery tests

- [ ] **Step 1: Run baseline auth tests before touching code**

```bash
node --experimental-strip-types --test \
  tests/customer-auth.test.ts \
  tests/customer-account-actions.test.ts \
  tests/customer-account-security.test.ts \
  tests/customer-signup-confirmation.test.ts \
  tests/customer-password-confirmation.test.ts \
  tests/password-recovery-flow.test.ts \
  tests/password-recovery-durable-grant.test.ts \
  tests/password-recovery-referrer.test.ts \
  tests/password-recovery-regression.test.ts
```

Expected: PASS. If baseline is not green, stop this plan and diagnose the pre-existing failure before changing dashboard settings.

- [ ] **Step 2: Record exact current policy assumptions**

Create `docs/superpowers/phase-hardening/SUPABASE_AUTH_SECURITY.md` with a table containing: signup minimum/character checks in app, reset minimum/character checks, whether server maps Supabase weak-password errors, email confirmation flow, application login/reset rate limits, admin MFA/AAL2 status.

- [ ] **Step 3: Commit inventory doc**

```bash
git add docs/superpowers/phase-hardening/SUPABASE_AUTH_SECURITY.md
git commit -m "docs: inventory Supabase auth security"
```

### Task 2: Align app validation with a strong free password policy

**Files:**
- Modify only the exact account action/form files identified in Task 1.
- Modify matching account tests.

**Interfaces:**
- Shared policy target: minimum 8 characters plus at least one lowercase, uppercase, digit and symbol.
- Server validation remains authoritative; client validation mirrors it for UX.

- [ ] **Step 1: Write failing policy tests**

Add cases that reject:

```text
short7!
onlylowercase1!
ONLYUPPERCASE1!
NoDigitsHere!
NoSymbolsHere1
```

and accept a representative value such as:

```text
ProxyBembem9!
```

Tests must assert the user-facing error is generic enough not to leak account existence and explicit enough to state password requirements.

- [ ] **Step 2: Run focused tests and verify failure**

Run the account actions/signup/recovery tests. Expected: at least the new strong-character cases FAIL if current app only checks a weaker policy.

- [ ] **Step 3: Implement one shared validator**

Prefer a focused server-safe module such as `lib/auth/password-policy.ts` if signup and recovery currently duplicate checks. Interface:

```ts
export function validateCustomerPassword(password: string): string | null
```

Return `null` when valid; otherwise return one stable Portuguese requirement message. Reuse the same predicate for signup and password reset; client UI may import a pure helper only if it does not pull server-only dependencies.

- [ ] **Step 4: Run all auth/recovery tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib components tests
git commit -m "feat: strengthen customer password policy"
```

### Task 3: Apply free Supabase Auth settings only after code support exists

**External configuration:** Supabase project `kicgoocozxzkuoqajqif` (`ProxyBembem`).

- [ ] **Step 1: Verify current Supabase docs/settings immediately before mutation**

Confirm Password Security docs still state leaked-password protection is Pro+, and verify the dashboard labels for minimum length/required characters/email confirmation. Do not rely on stale screenshots or memory.

- [ ] **Step 2: Set password strength in Dashboard/Management API**

Target settings:

```text
Minimum password length: 8
Required characters: lowercase + uppercase + digits + symbols
Leaked Password Protection: OFF (accepted paid limitation)
```

If the connected Supabase tool still does not expose Auth config mutation, perform this as an owner dashboard step and record the exact values in `SUPABASE_AUTH_SECURITY.md`; do not claim it was changed programmatically.

- [ ] **Step 3: Verify email confirmation**

Ensure email confirmation for customer email/password signup is enabled. Verify with a sandbox/test signup that no authenticated checkout session exists until confirmation completes.

- [ ] **Step 4: Review password-change reauthentication/current-password options**

Enable a stronger option only if the application currently has a password-change UI capable of supplying the required nonce/current password. The existing recovery-by-email flow must not be broken by enabling a setting intended for signed-in password changes. Record the decision and rationale explicitly.

- [ ] **Step 5: Review Auth rate limits**

Keep Supabase Auth defaults or stricter values compatible with the app; application-level limits already protect signup/login/recovery. Record the effective Supabase limits rather than duplicating arbitrary tighter limits without load evidence.

- [ ] **Step 6: CAPTCHA decision**

CAPTCHA/Turnstile is supported by Supabase, but enabling it requires provider credentials and client challenge tokens. If no dedicated sandbox/production Turnstile credentials are available, record `NOT ENABLED — external credential prerequisite`; do not block the rest of this hardening and do not put site/secret keys in the repository. If credentials are available, create a separate reviewed change with tests before toggling Supabase CAPTCHA.

- [ ] **Step 7: Update and commit evidence doc**

```bash
git add docs/superpowers/phase-hardening/SUPABASE_AUTH_SECURITY.md
git commit -m "docs: record Supabase auth hardening"
```

### Task 4: Security Advisor review without unsafe cosmetic fixes

**Files:**
- Modify: `docs/superpowers/phase-hardening/SUPABASE_AUTH_SECURITY.md`

- [ ] **Step 1: Re-run Supabase Security Advisor**

Expected known findings from baseline include:

- `auth_leaked_password_protection` WARN — accepted because feature is Pro+.
- `rls_enabled_no_policy` INFO on server-only/deny-by-default tables — classify table by table; no broad browser policies.
- `authenticated_security_definer_function_executable` WARN for `customer_get_order` and `customer_list_orders` — inspect function bodies and grants before changing them.

- [ ] **Step 2: Verify customer RPC ownership checks**

For `customer_get_order(p_order_id uuid)` and `customer_list_orders(p_limit integer, p_offset integer)`, inspect definitions and assert all returned orders are constrained by `(select auth.uid())`/equivalent authenticated owner identity, `search_path` is fixed where applicable, and EXECUTE is not granted to `anon`.

If any ownership check is absent, stop and create a focused migration/test under TDD; do not patch permissions blindly. If checks are present, document the warning as intentional authenticated API surface.

- [ ] **Step 3: Classify RLS-no-policy tables**

For each finding, record why no browser policy is correct (server-only service-key table) or identify a real intended client access requirement. Never add `USING (true)` or broad `TO authenticated` solely to clear the Advisor.

- [ ] **Step 4: Commit Advisor evidence**

```bash
git add docs/superpowers/phase-hardening/SUPABASE_AUTH_SECURITY.md
git commit -m "docs: classify Supabase security advisor findings"
```

### Task 5: Full repository acceptance gate

**Files:**
- Create: `docs/superpowers/phase-hardening/FINAL_ACCEPTANCE.md`

- [ ] **Step 1: Run gates in this exact order**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build:kinghost
pnpm test
```

Expected: every command exits 0.

- [ ] **Step 2: Run critical commerce/security subset explicitly**

```bash
node --experimental-strip-types --test \
  tests/checkout-flow.test.ts \
  tests/checkout-route.test.ts \
  tests/checkout-origin.test.ts \
  tests/shipping-quote.test.ts \
  tests/shipping-quote-token.test.ts \
  tests/mercadopago-checkout-url.test.ts \
  tests/mercadopago-preference.test.ts \
  tests/webhook-route.test.ts \
  tests/webhook-signature.test.ts \
  tests/melhor-envio-oauth-routes.test.ts \
  tests/private-order-only.test.ts \
  tests/phase9-route-security.test.ts \
  tests/phase9-supabase-hardening.test.ts
```

Expected: PASS.

- [ ] **Step 3: Record exact commit and command outputs**

`FINAL_ACCEPTANCE.md` must contain branch SHA, Node/pnpm versions, each command and pass/fail, Security Advisor summary, and a statement that local/CI acceptance is not yet production acceptance.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/phase-hardening/FINAL_ACCEPTANCE.md
git commit -m "docs: record hardening verification"
```

### Task 6: Isolated KingHost sandbox smoke before merge

**Environment:** existing separate KingHost sandbox app and separate sandbox Supabase/provider credentials from `docs/deployment/kinghost-sandbox.md`.

- [ ] **Step 1: Deploy only this branch to the sandbox app**

Use the existing `deploy:kinghost` flow with the sandbox-specific `KINGHOST_WEB_ROOT`. Keep `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false`.

- [ ] **Step 2: Verify strict CSP in the browser/network response**

Confirm `Content-Security-Policy` contains a request nonce and `script-src` has no `'unsafe-inline'`. Reload twice and confirm nonce changes. Browser console must show no CSP violation that breaks storefront/account/checkout behavior.

- [ ] **Step 3: Run end-to-end smoke**

In order: storefront -> account signup -> email confirmation -> login -> product -> cart -> checkout -> Melhor Envio sandbox quote -> Mercado Pago sandbox redirect/payment -> webhook -> private customer order -> admin login/MFA -> critical admin pages.

No real payment, production webhook, production Supabase write or real Melhor Envio label purchase is allowed.

- [ ] **Step 4: Verify trusted-proxy behavior**

Using the sandbox-configured `RATE_LIMIT_TRUSTED_PROXY_HOPS`, confirm malformed/spoofed forwarded headers cannot create arbitrary per-header buckets and normal clients are not all unintentionally collapsed if a verified IP identity is available.

- [ ] **Step 5: Update final acceptance evidence**

Record sandbox host only if it is non-secret/public, deployed SHA, smoke pass/fail, CSP result and proxy-hop configuration. Do not record credentials, tokens or full sensitive headers.

- [ ] **Step 6: Final commit**

```bash
git add docs/superpowers/phase-hardening/FINAL_ACCEPTANCE.md
git commit -m "docs: accept hardening sandbox candidate"
```

### Task 7: Merge readiness only

- [ ] **Step 1: Compare branch against `main`**

Review all changed files. Confirm no production secret, sandbox credential or unrelated refactor appears.

- [ ] **Step 2: Re-run CI on final SHA**

Expected: all required checks PASS.

- [ ] **Step 3: Open a PR to `main`**

PR body must summarize nonce CSP/dynamic-rendering impact, rate-limit proxy trust setting, lint/SEO changes, Supabase Auth settings, accepted paid leaked-password warning, Advisor classifications and sandbox evidence.

Do not merge automatically; leave the final merge/deploy as an explicit owner decision.