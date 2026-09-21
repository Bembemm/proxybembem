# Password Recovery Token-Hash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-bound recovery PKCE exchange with a Supabase `TokenHash` recovery flow where opening the email does not consume the one-time credential; verification happens only when the user submits a new password.

**Architecture:** The reset email points to `/auth/confirm?token_hash=...&type=recovery`. `GET /auth/confirm` validates only the shape/type, stores the token hash in a short-lived HttpOnly recovery cookie, strips the secret from the URL, and redirects to `/redefinir-senha` without calling Supabase. The final password POST calls `verifyOtp({ token_hash, type: "recovery" })`, updates the password, preserves a retry-capable verified recovery session if update fails after OTP consumption, and globally signs out after success.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, `@supabase/ssr` 0.12.5, `@supabase/supabase-js` 2.112.4, Node.js 22.x built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-05-password-recovery-token-hash-design.md`

## Global Constraints

- Work on `feat/admin-dashboard-expansion`; do not start Phase 4.
- Do not reapply any Supabase migration.
- Keep password-reset account-existence responses generic.
- Recovery success destination is fixed to `/redefinir-senha`; no caller-controlled `next` is introduced.
- Never log `token_hash`, email, password, auth code, access token, refresh token, cookie values, or complete recovery URLs.
- All recovery/auth responses that may carry credentials or session cookies use `Cache-Control: private, no-store`.
- Recovery cookies are host-only, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, with a bounded lifetime.
- `GET /auth/confirm` must never call `verifyOtp()`; scanners/prefetches must not consume the recovery credential.
- The existing `/auth/callback` stays available for non-recovery flows.
- The final successful password reset must still call `signOut({ scope: "global" })`.
- A successful `verifyOtp()` followed by a failed password update must preserve a validated recovery retry path so another email is not required.
- No real Mercado Pago payment is required or allowed for this task.

---

### Task 1: Replace the PKCE recovery expectations with RED token-hash coverage

**Files:**
- Modify: `tests/password-recovery-flow.test.ts`
- Modify: `tests/customer-account-actions.test.ts`

**Interfaces:**
- Consumes: current route/page source files and the existing `source()` test helper.
- Produces: regression requirements for `/auth/confirm`, recovery cookies, final-submit `verifyOtp()`, retry marker, no recovery callback dependency, and no secret logging.

- [ ] **Step 1: Rewrite the recovery-flow tests so the old implementation fails for the new reasons**

Replace the PKCE-specific recovery tests with assertions equivalent to:

```ts
test("password recovery request no longer depends on the auth callback PKCE redirect", async () => {
  const resetRoute = await source("../app/api/account/password-reset/route.ts")

  assert.match(resetRoute, /resetPasswordForEmail\s*\(\s*input\.email\s*\)/)
  assert.doesNotMatch(resetRoute, /auth\/callback\?next=/)
  assert.doesNotMatch(resetRoute, /redirectTo/)
  assert.doesNotMatch(resetRoute, /Password recovery request diagnostic/)
})

test("recovery email landing stores token hash without consuming it", async () => {
  const confirm = await source("../app/auth/confirm/route.ts")

  assert.match(confirm, /searchParams\.get\(\s*["']token_hash["']\s*\)/)
  assert.match(confirm, /searchParams\.get\(\s*["']type["']\s*\)/)
  assert.match(confirm, /type\s*!==\s*["']recovery["']/)
  assert.doesNotMatch(confirm, /verifyOtp\s*\(/)
  assert.match(confirm, /HttpOnly|httpOnly\s*:\s*true/)
  assert.match(confirm, /sameSite\s*:\s*["']lax["']/i)
  assert.match(confirm, /private,\s*no-store/i)
  assert.match(confirm, /\/redefinir-senha/)
})

test("standalone reset page accepts recovery context without requiring ordinary customer auth", async () => {
  const page = await source("../app/redefinir-senha/page.tsx")

  assert.doesNotMatch(page, /requireCustomerPageAccess\s*\(/)
  assert.match(page, /PasswordForm[^>]*recovery/)
  assert.match(page, /recovery/i)
})

test("recovery token is verified only on final password submit", async () => {
  const route = await source("../app/api/account/password-recovery/route.ts")

  assert.match(
    route,
    /auth\.verifyOtp\s*\(\s*\{\s*token_hash\s*:\s*[^,]+,\s*type\s*:\s*["']recovery["']\s*\}\s*\)/,
  )
  assert.match(route, /auth\.updateUser\s*\(\s*\{\s*password:/)
  assert.match(route, /auth\.signOut\s*\(\s*\{\s*scope:\s*["']global["']/)
  assert.match(route, /recovery.*verified|verified.*recovery/i)
  assert.match(route, /private,\s*no-store/i)
})

test("recovery implementation never logs recovery credentials", async () => {
  const combined = [
    await source("../app/auth/confirm/route.ts"),
    await source("../app/api/account/password-reset/route.ts"),
    await source("../app/api/account/password-recovery/route.ts"),
  ].join("\n")

  assert.doesNotMatch(
    combined,
    /console\.(?:log|info|warn|error)\([^\n]*(?:token_hash|password|input\.email|access_token|refresh_token|request\.nextUrl)/i,
  )
})
```

Update `customer-account-actions.test.ts` so `/auth/confirm` is expected in the account proxy matcher, while `/auth/callback` remains required for non-recovery auth.

- [ ] **Step 2: Run the focused test and prove RED**

Run:

```bash
pnpm test -- tests/password-recovery-flow.test.ts
```

If the repository's script does not forward file arguments, run the exact Node command:

```bash
node --experimental-strip-types --test tests/password-recovery-flow.test.ts
```

Expected: failures because `app/auth/confirm/route.ts` does not exist, reset still builds `/auth/callback`, `/redefinir-senha` still requires ordinary auth, and the recovery POST does not call `verifyOtp()`.

- [ ] **Step 3: Run the whole test suite once to record the RED baseline**

```bash
pnpm test
```

Expected: only the newly changed recovery expectations fail; unrelated account/admin/checkout tests remain green.

- [ ] **Step 4: Commit the RED**

```bash
git add tests/password-recovery-flow.test.ts tests/customer-account-actions.test.ts
git commit -m "test: require token-hash password recovery"
```

---

### Task 2: Add the non-consuming recovery landing and recovery context helpers

**Files:**
- Create: `lib/server/password-recovery.ts`
- Create: `app/auth/confirm/route.ts`
- Modify: `app/redefinir-senha/page.tsx`
- Modify: `proxy.ts`
- Test: `tests/password-recovery-flow.test.ts`

**Interfaces:**
- Produces constants `RECOVERY_TOKEN_COOKIE`, `RECOVERY_VERIFIED_COOKIE`, `RECOVERY_COOKIE_MAX_AGE_SECONDS`.
- Produces `isValidRecoveryTokenHash(value: string | null): value is string`.
- Produces `setRecoveryTokenCookie(response, tokenHash)`, `setRecoveryVerifiedCookie(response)`, `clearRecoveryCookies(response)` for `NextResponse`.
- `/auth/confirm` stores only a syntactically bounded token hash and redirects to clean `/redefinir-senha`.

- [ ] **Step 1: Add pure helper tests before the helper implementation**

Extend `tests/password-recovery-flow.test.ts` to import the helper once it exists and assert a bounded token shape, for example:

```ts
test("recovery token hash validation is strict and bounded", async () => {
  const recovery = await import("../lib/server/password-recovery.ts")

  assert.equal(recovery.isValidRecoveryTokenHash("a".repeat(64)), true)
  assert.equal(recovery.isValidRecoveryTokenHash(""), false)
  assert.equal(recovery.isValidRecoveryTokenHash("a b"), false)
  assert.equal(recovery.isValidRecoveryTokenHash("a".repeat(1025)), false)
})
```

The validator should accept URL-safe token-hash characters (`A-Z`, `a-z`, `0-9`, `_`, `-`) and length `32..1024` without assuming a single fixed Supabase hash length.

- [ ] **Step 2: Run focused RED**

```bash
node --experimental-strip-types --test tests/password-recovery-flow.test.ts
```

Expected: import failure because `lib/server/password-recovery.ts` does not exist.

- [ ] **Step 3: Implement `lib/server/password-recovery.ts` minimally**

Use this shape:

```ts
import type { NextResponse } from "next/server"

export const RECOVERY_TOKEN_COOKIE = "proxybembem-recovery-token"
export const RECOVERY_VERIFIED_COOKIE = "proxybembem-recovery-verified"
export const RECOVERY_COOKIE_MAX_AGE_SECONDS = 3600

const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{32,1024}$/

export function isValidRecoveryTokenHash(value: string | null): value is string {
  return typeof value === "string" && TOKEN_HASH_PATTERN.test(value)
}

function options(maxAge = RECOVERY_COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  }
}

export function setRecoveryTokenCookie(response: NextResponse, tokenHash: string) {
  response.cookies.set(RECOVERY_TOKEN_COOKIE, tokenHash, options())
  response.cookies.set(RECOVERY_VERIFIED_COOKIE, "", options(0))
  return response
}

export function setRecoveryVerifiedCookie(response: NextResponse) {
  response.cookies.set(RECOVERY_VERIFIED_COOKIE, "1", options())
  response.cookies.set(RECOVERY_TOKEN_COOKIE, "", options(0))
  return response
}

export function clearRecoveryCookies(response: NextResponse) {
  response.cookies.set(RECOVERY_TOKEN_COOKIE, "", options(0))
  response.cookies.set(RECOVERY_VERIFIED_COOKIE, "", options(0))
  return response
}
```

- [ ] **Step 4: Create `GET /auth/confirm` without any Supabase call**

Implement `app/auth/confirm/route.ts` so it:

```ts
import { NextResponse, type NextRequest } from "next/server"
import { resolvePublicSiteUrl } from "../../../lib/server/env.ts"
import {
  isValidRecoveryTokenHash,
  setRecoveryTokenCookie,
} from "../../../lib/server/password-recovery.ts"

function redirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(
    new URL(path, resolvePublicSiteUrl(request.nextUrl.origin)),
    303,
  )
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type")
  const tokenHash = request.nextUrl.searchParams.get("token_hash")

  if (type !== "recovery" || !isValidRecoveryTokenHash(tokenHash)) {
    return redirect(request, "/entrar?erro=recovery")
  }

  return setRecoveryTokenCookie(redirect(request, "/redefinir-senha"), tokenHash)
}
```

Do not import/create a Supabase client in this GET route.

- [ ] **Step 5: Allow `/redefinir-senha` only from recovery context**

Replace `requireCustomerPageAccess()` with recovery-context checks using `cookies()` plus, only for the verified-marker retry case, a server-side `getUser()` validation:

```ts
const cookieStore = await cookies()
const tokenHash = cookieStore.get(RECOVERY_TOKEN_COOKIE)?.value ?? null
const verified = cookieStore.get(RECOVERY_VERIFIED_COOKIE)?.value === "1"

if (!isValidRecoveryTokenHash(tokenHash) && !verified) {
  redirect("/entrar?erro=recovery")
}

if (!isValidRecoveryTokenHash(tokenHash) && verified) {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user?.email_confirmed_at) redirect("/entrar?erro=recovery")
}
```

Keep `export const dynamic = "force-dynamic"` and `<PasswordForm recovery />`.

- [ ] **Step 6: Add `/auth/confirm` to the proxy matcher**

Add:

```ts
"/auth/confirm",
```

Keep `/auth/callback` because signup/non-recovery flows still use it.

- [ ] **Step 7: Run focused tests and typecheck**

```bash
node --experimental-strip-types --test tests/password-recovery-flow.test.ts
pnpm typecheck
```

Expected: helper/confirm/page expectations pass; final-submit and reset-request tests may still be RED until Task 3.

- [ ] **Step 8: Commit the recovery landing**

```bash
git add lib/server/password-recovery.ts app/auth/confirm/route.ts app/redefinir-senha/page.tsx proxy.ts tests/password-recovery-flow.test.ts
git commit -m "feat: add non-consuming recovery landing"
```

---

### Task 3: Move recovery verification to final password submission

**Files:**
- Modify: `app/api/account/password-reset/route.ts`
- Modify: `app/api/account/password-recovery/route.ts`
- Modify: `app/auth/callback/route.ts`
- Modify: `lib/supabase/route.ts` only if recovery-only diagnostic plumbing becomes unused
- Test: `tests/password-recovery-flow.test.ts`

**Interfaces:**
- `POST /api/account/password-reset`: calls `resetPasswordForEmail(input.email)` with no recovery callback redirect.
- `POST /api/account/password-recovery`: consumes `RECOVERY_TOKEN_COOKIE` using `verifyOtp()` on first submit, or uses a validated Supabase session when `RECOVERY_VERIFIED_COOKIE=1` on a retry.
- Response cookie writes from Supabase must use `createSupabaseRouteClient(request).applyToResponse(...)` so the session created by `verifyOtp()` reaches the browser.

- [ ] **Step 1: Add the retry-path assertions before implementation**

Extend the recovery test so source requires all three branches:

```ts
assert.match(route, /RECOVERY_TOKEN_COOKIE/)
assert.match(route, /RECOVERY_VERIFIED_COOKIE/)
assert.match(route, /createSupabaseRouteClient/)
assert.match(route, /applyToResponse/)
assert.match(route, /auth\.verifyOtp/)
assert.match(route, /setRecoveryVerifiedCookie/)
assert.match(route, /clearRecoveryCookies/)
assert.match(route, /auth\.getUser/)
```

Also assert `password-reset/route.ts` no longer contains `redirectTo`, `getPendingCookieNames`, or the temporary recovery request diagnostic.

- [ ] **Step 2: Run focused RED**

```bash
node --experimental-strip-types --test tests/password-recovery-flow.test.ts
```

Expected: failures because reset still has callback/diagnostic code and final POST still assumes an already-authenticated session.

- [ ] **Step 3: Simplify `POST /api/account/password-reset`**

Keep same-origin, rate limiting, bounded JSON parsing, generic anti-enumeration response, and 429/5xx behavior. Replace the recovery call with:

```ts
const routeClient = createSupabaseRouteClient(request)
const { error } = await routeClient.supabase.auth.resetPasswordForEmail(input.email)
```

Remove recovery `redirectTo`, `resolvePublicSiteUrl`, `logPasswordRecoveryRequestDiagnostic`, and `getPendingCookieNames()` usage from this route. Apply queued Supabase cookies/headers only if the SDK still produces any; they are no longer a correctness dependency.

- [ ] **Step 4: Rework `POST /api/account/password-recovery` around the route client**

Use `createSupabaseRouteClient(request)` rather than `createSupabaseServerClient()` so newly created session cookies can be attached to exact JSON responses.

The control flow must be:

```ts
const tokenHash = request.cookies.get(RECOVERY_TOKEN_COOKIE)?.value ?? null
const verifiedMarker = request.cookies.get(RECOVERY_VERIFIED_COOKIE)?.value === "1"
const routeClient = createSupabaseRouteClient(request)

if (isValidRecoveryTokenHash(tokenHash)) {
  const { error: verifyError } = await routeClient.supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  })
  if (verifyError) {
    return clearRecoveryCookies(
      routeClient.applyToResponse(
        json(401, { ok: false, message: "Link de recuperação inválido ou expirado." }),
      ),
    )
  }
} else if (verifiedMarker) {
  const { data, error } = await routeClient.supabase.auth.getUser()
  if (error || !data.user?.email_confirmed_at) {
    return clearRecoveryCookies(
      routeClient.applyToResponse(
        json(401, { ok: false, message: "Link de recuperação inválido ou expirado." }),
      ),
    )
  }
} else {
  return clearRecoveryCookies(
    json(401, { ok: false, message: "Link de recuperação inválido ou expirado." }),
  )
}
```

After a first successful `verifyOtp()`, create the response through `applyToResponse()` and ensure the verified marker is set before returning any password-update error. This preserves the Supabase recovery session after the one-time token has been consumed.

Then call:

```ts
const { error: updateError } = await routeClient.supabase.auth.updateUser({
  password: input.password,
})
```

If `updateUser()` fails after successful verification, return a 400 response with Supabase session cookies + `RECOVERY_VERIFIED_COOKIE`, and with the raw token cookie cleared.

On update success call:

```ts
const { error: signOutError } = await routeClient.supabase.auth.signOut({ scope: "global" })
```

Apply Supabase cookie mutations, clear both recovery cookies, and return success. Preserve the existing explicit 503 copy if global sign-out fails after password change.

- [ ] **Step 5: Remove recovery-only diagnostics from `/auth/callback`**

Delete `hasPkceCodeVerifierCookie`, `sanitizeAuthErrorCode`, `logRecoveryCallbackDiagnostic`, recovery-specific logging branches, and recovery-specific `sb_flow_id` assertions only if they are not needed by another auth flow. Keep generic `exchangeCodeForSession()` behavior and safe `sanitizeAccountNext()` handling for signup/non-recovery callback use.

Do **not** remove `/auth/callback` itself.

- [ ] **Step 6: Remove now-unused `getPendingCookieNames()` only if no callers remain**

Search all callers. If only the deleted reset diagnostic used it, remove the helper from `lib/supabase/route.ts`. Keep `applyToResponse` and the experimental flow-id setting if non-recovery callback behavior still depends on them.

- [ ] **Step 7: Run focused tests, typecheck, and full tests**

```bash
node --experimental-strip-types --test tests/password-recovery-flow.test.ts
pnpm typecheck
pnpm test
```

Expected: all recovery tests green and no unrelated regressions.

- [ ] **Step 8: Commit the runtime switch**

```bash
git add app/api/account/password-reset/route.ts app/api/account/password-recovery/route.ts app/auth/callback/route.ts lib/supabase/route.ts tests/password-recovery-flow.test.ts
git commit -m "fix: verify recovery token on password submit"
```

---

### Task 4: Verify Vercel candidate and checkpoint the manual Supabase template gate

**Files:**
- Modify: `docs/superpowers/CURRENT_STATUS.md`
- Reference: `docs/deployment/vercel.md`
- Reference: `docs/superpowers/specs/2026-09-05-password-recovery-token-hash-design.md`

**Interfaces:**
- Produces the exact candidate commit/run evidence and the manual dashboard/template steps required before requesting another real recovery email.

- [ ] **Step 1: Run the complete local/CI-equivalent verification**

```bash
nvm use
npx pnpm@10 install --frozen-lockfile
npx pnpm@10 typecheck
NODE_ENV=production npx pnpm@10 build
npx pnpm@10 test
```

Expected: Node `22.1.0`, typecheck PASS, Vercel build/standalone preparation PASS, full test suite PASS.

- [ ] **Step 2: Confirm no recovery secret can enter logs**

Search the changed runtime files for logging:

```bash
grep -RInE 'console\.(log|info|warn|error).*?(token_hash|password|access_token|refresh_token|input\.email|request\.nextUrl)' \
  app/auth/confirm app/api/account/password-reset app/api/account/password-recovery
```

Expected: no matches.

- [ ] **Step 3: Update `CURRENT_STATUS.md`**

Replace the old "next action = multi-flow PKCE acceptance" section with the new checkpoint:

- token-hash design/spec and implementation plan paths;
- RED commit/run evidence;
- GREEN runtime candidate commit/run evidence;
- recovery no longer depends on the browser PKCE verifier;
- `/auth/callback` remains for non-recovery flows;
- before requesting a real recovery email, Supabase **Authentication -> Email Templates -> Reset Password** must use exactly:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">
  Redefinir senha
</a>
```

- do not reuse an old recovery email; request one fresh email only after runtime deployment + template save;
- manual acceptance should prove that opening the email does not consume the token and password submission does.

- [ ] **Step 4: Commit the durable checkpoint**

```bash
git add docs/superpowers/CURRENT_STATUS.md
git commit -m "docs: checkpoint token-hash recovery"
```

- [ ] **Step 5: Deploy to Vercel only after CI is green**

Use the existing runbook commands:

```bash
cd ~/apps_nodejs/proxybembem
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 build
```

Restart through the Vercel dashboard, not by creating a second process manually.

- [ ] **Step 6: Change the Supabase Reset Password template before requesting another email**

In hosted Supabase:

`Authentication -> Email Templates -> Reset Password`

Set the recovery CTA link to:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

The old `{{ .ConfirmationURL }}` / `/auth/callback?next=/redefinir-senha` recovery link must no longer be used.

- [ ] **Step 7: Perform one clean manual acceptance**

After the email limit is available:

1. request exactly one fresh password-recovery email;
2. open the link once;
3. verify browser URL cleans to `/redefinir-senha` and remains usable after a refresh;
4. do not expect a Supabase `/token?grant_type=pkce` exchange merely from opening the email;
5. submit a new password once;
6. verify login succeeds with the new password and the old password fails;
7. verify the same recovery link cannot reset the password again after the successful change;
8. review Vercel and Supabase Auth logs for errors without exposing secrets.

- [ ] **Step 8: Continue the remaining Task 14 acceptance only after recovery passes**

Do not start Phase 4 until the rest of customer-account acceptance is complete.
