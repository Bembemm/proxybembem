# Admin Auth + Mandatory MFA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-owner `/admin` authentication foundation using Supabase email/password plus mandatory TOTP MFA, exact server-side 30-minute inactivity enforcement, and one active administrative session at a time.

**Architecture:** Supabase Auth remains the identity and MFA provider, using the official `@supabase/ssr` cookie flow for Next.js. Administrative authorization is a second server-owned layer keyed by Supabase `session_id`: it requires the configured owner UUID, `aal2`, an active `admin_sessions` record, and less than 30 minutes of inactivity. All admin pages and APIs share the same server authorization boundary; the existing Melhor Envio OAuth callback remains state-protected and public to the provider.

**Tech Stack:** Next.js 16.3.3 App Router, React 19, TypeScript 5.7.3, `@supabase/supabase-js`, `@supabase/ssr`, Supabase Auth/PostgreSQL/PostgREST RPC, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-auth-mfa-design.md`

## Global Constraints

- Work only on `feat/checkout-mercadopago`; do not merge or modify `main` without explicit owner approval.
- Preview/Sandbox first. Do not move Mercado Pago or Melhor Envio to Production as part of this feature.
- Exactly one authorized admin account, identified server-side by immutable Supabase user UUID.
- Every new administrative login requires email/password followed by TOTP; there is no trusted-device bypass.
- Protected admin authorization requires a validated Supabase session with `aal2` plus an active server-side admin session.
- Administrative inactivity expires at 30 minutes and is decided by the server/database, not a browser timer.
- Only one administrative session may be active at a time. A new activation revokes the previous active admin session.
- A revoked or expired Supabase `session_id` may never reactivate its prior administrative session. Activation is one-time per Supabase session and requires recent password + TOTP evidence from the JWT `amr` claim.
- Use a 10-minute maximum age for both the password and TOTP `amr` entries when activating a new admin session. If activation is delayed beyond that window, force a fresh login.
- No public admin signup UI, SMS fallback, email MFA bypass, trusted-device bypass, or self-service TOTP reset.
- If authentication, authorization, or admin-session persistence cannot be verified, fail closed.
- Never expose `SUPABASE_SECRET_KEY`, `ADMIN_USER_ID`, Melhor Envio secrets/tokens, Mercado Pago secrets, Auth cookies, refresh tokens, or TOTP enrollment secrets in logs or browser-visible responses.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is intentionally browser-safe; it grants no admin privilege by itself.
- Preserve the existing Melhor Envio OAuth state generation, SHA-256 persistence, 10-minute expiry, one-shot consumption, encrypted tokens, and callback behavior.
- Follow RED → GREEN TDD for security/business behavior and run fresh `pnpm test`, `pnpm typecheck`, and `pnpm build` before completion claims.

---

## Planned file structure

### Create

- `lib/supabase/config.ts` — browser-safe Supabase URL/publishable-key validation.
- `lib/supabase/client.ts` — browser Supabase client.
- `lib/supabase/server.ts` — request-scoped server Supabase client using Next cookies.
- `lib/supabase/proxy.ts` — cookie refresh/coarse unauthenticated admin redirect.
- `proxy.ts` — Next.js 16 proxy matcher for admin/auth-relevant routes.
- `lib/server/admin-session-repository.ts` — server-only RPC access for admin-session activation/check/touch/revocation.
- `lib/server/admin-auth-core.ts` — pure claim/UUID/AAL/AMR validation.
- `lib/server/admin-auth.ts` — shared production admin authorization orchestration.
- `supabase/migrations/202608310001_admin_sessions.sql` — backend-only session table and atomic RPCs.
- `app/admin/login/page.tsx`
- `app/admin/login/login-form.tsx`
- `app/admin/setup-mfa/page.tsx`
- `app/admin/setup-mfa/setup-mfa-form.tsx`
- `app/admin/mfa/page.tsx`
- `app/admin/mfa/mfa-form.tsx`
- `app/admin/page.tsx`
- `app/admin/error.tsx`
- `app/api/admin/session/activate/route.ts`
- `app/api/admin/logout/route.ts`
- `lib/server/melhor-envio-oauth-start.ts` — testable OAuth-start handler with admin-auth dependency.
- `tests/admin-auth-env.test.ts`
- `tests/admin-auth-ssr.test.ts`
- `tests/admin-session-migration.test.ts`
- `tests/admin-session-repository.test.ts`
- `tests/admin-auth-core.test.ts`
- `tests/admin-auth.test.ts`
- `tests/admin-auth-ui.test.ts`

### Modify

- `package.json` / `pnpm-lock.yaml` — add official Supabase browser/SSR packages.
- `lib/server/env.ts` — add `ADMIN_USER_ID`; remove the Melhor Envio manual admin-secret requirement after route migration.
- `.env.example` — add browser-safe Supabase Auth variables and `ADMIN_USER_ID`; remove `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` after migration.
- `app/admin/integrations/melhor-envio/page.tsx` — require admin access and remove the password/secret input.
- `app/api/internal/melhor-envio/oauth/start/route.ts` — delegate to authenticated handler rather than shared-secret parsing.
- `tests/melhor-envio-env.test.ts` — remove manual OAuth admin-secret contract.
- `tests/melhor-envio-oauth-routes.test.ts` — replace owner-secret expectations with admin-session authorization expectations.
- `docs/shipping-setup.md` — document authenticated admin reauthorization flow.
- `docs/superpowers/CURRENT_STATUS.md` — update only after Preview acceptance succeeds.

---

### Task 1: Add the Supabase Auth dependency and environment contract

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `lib/server/env.ts`
- Modify: `.env.example`
- Create: `lib/supabase/config.ts`
- Create: `tests/admin-auth-env.test.ts`

**Interfaces:**

```ts
export interface SupabaseBrowserConfig {
  url: string
  publishableKey: string
}

export function getSupabaseBrowserConfig(): SupabaseBrowserConfig

export interface AdminAuthEnv {
  adminUserId: string
}

export function getAdminAuthEnv(): AdminAuthEnv
```

- [ ] **Step 1: Write failing environment-contract tests**

Create `tests/admin-auth-env.test.ts` with cases that require an HTTPS public Supabase URL, a publishable key, and a canonical UUID for the sole admin:

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { getSupabaseBrowserConfig } from "../lib/supabase/config.ts"
import { getAdminAuthEnv } from "../lib/server/env.ts"

const ADMIN_ID = "11111111-1111-4111-8111-111111111111"

test("admin auth accepts browser-safe Supabase config plus immutable owner UUID", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key_1234567890"
  process.env.ADMIN_USER_ID = ADMIN_ID

  assert.deepEqual(getSupabaseBrowserConfig(), {
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_test_key_1234567890",
  })
  assert.deepEqual(getAdminAuthEnv(), { adminUserId: ADMIN_ID })
})
```

Add negative cases for `http://` public URL, missing/blank publishable key, a key not beginning with `sb_publishable_`, and malformed `ADMIN_USER_ID`.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --experimental-strip-types --test tests/admin-auth-env.test.ts
```

Expected: FAIL because `lib/supabase/config.ts` and `getAdminAuthEnv()` do not exist.

- [ ] **Step 3: Install the official Supabase SSR packages**

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

Expected: `package.json` and `pnpm-lock.yaml` change; no other dependency is added.

- [ ] **Step 4: Implement browser-safe and server-only environment validation**

Create `lib/supabase/config.ts`:

```ts
function requiredPublic(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required public environment variable: ${name}`)
  return value
}

export function getSupabaseBrowserConfig() {
  const parsed = new URL(requiredPublic("NEXT_PUBLIC_SUPABASE_URL"))
  if (parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS")
  }

  const publishableKey = requiredPublic("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key")
  }

  return { url: parsed.origin, publishableKey }
}
```

Add to `lib/server/env.ts`:

```ts
export interface AdminAuthEnv {
  adminUserId: string
}

export function getAdminAuthEnv(): AdminAuthEnv {
  const adminUserId = required("ADMIN_USER_ID").toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(adminUserId)) {
    throw new Error("ADMIN_USER_ID must be a canonical UUID")
  }
  return { adminUserId }
}
```

Add only names, never real values, to `.env.example`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
ADMIN_USER_ID=
```

- [ ] **Step 5: Run focused tests and typecheck**

```bash
node --experimental-strip-types --test tests/admin-auth-env.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/server/env.ts lib/supabase/config.ts .env.example tests/admin-auth-env.test.ts
git commit -m "feat: add Supabase admin auth environment"
```

---

### Task 2: Add request-scoped Supabase SSR clients and Next proxy refresh

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/proxy.ts`
- Create: `proxy.ts`
- Create: `tests/admin-auth-ssr.test.ts`

**Interfaces:**

```ts
export function createSupabaseBrowserClient(): SupabaseClient
export async function createSupabaseServerClient(): Promise<SupabaseClient>
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse>
```

- [ ] **Step 1: Write failing SSR contract tests**

Use source-contract checks to prevent accidental service-key exposure and unverified server sessions:

```ts
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("browser Supabase client uses only NEXT_PUBLIC configuration", async () => {
  const source = await readFile(new URL("../lib/supabase/client.ts", import.meta.url), "utf8")
  assert.match(source, /NEXT_PUBLIC_SUPABASE|SupabaseBrowserConfig|getSupabaseBrowserConfig/)
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEY|service_role|sb_secret_/)
})

test("proxy validates claims instead of trusting getSession", async () => {
  const source = await readFile(new URL("../lib/supabase/proxy.ts", import.meta.url), "utf8")
  assert.match(source, /getClaims\s*\(/)
  assert.doesNotMatch(source, /getSession\s*\(/)
})
```

Also assert root `proxy.ts` matches `/admin/:path*`, `/api/admin/:path*`, and `/api/internal/melhor-envio/oauth/start`.

- [ ] **Step 2: Run the test and verify RED**

```bash
node --experimental-strip-types --test tests/admin-auth-ssr.test.ts
```

Expected: FAIL because the SSR client/proxy files do not exist.

- [ ] **Step 3: Implement the browser and server clients**

`lib/supabase/client.ts`:

```ts
"use client"

import { createBrowserClient } from "@supabase/ssr"
import { getSupabaseBrowserConfig } from "./config.ts"

export function createSupabaseBrowserClient() {
  const env = getSupabaseBrowserConfig()
  return createBrowserClient(env.url, env.publishableKey)
}
```

`lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseBrowserConfig } from "./config.ts"

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const env = getSupabaseBrowserConfig()

  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet, headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Proxy refresh owns writes when this runs inside a Server Component.
        }
        void headers
      },
    },
  })
}
```

- [ ] **Step 4: Implement proxy token refresh and coarse page protection**

`lib/supabase/proxy.ts` must create a new server client per request, call `getClaims()` immediately, copy all refreshed cookies/headers to the outgoing response, and only redirect unauthenticated **page** requests under protected `/admin` paths. `/admin/login`, `/admin/mfa`, and `/admin/setup-mfa` remain reachable for the authentication flow.

Use this shape:

```ts
const AUTH_FLOW_PATHS = new Set(["/admin/login", "/admin/mfa", "/admin/setup-mfa"])

const { data } = await supabase.auth.getClaims()
const claims = data?.claims

if (
  request.nextUrl.pathname.startsWith("/admin") &&
  !AUTH_FLOW_PATHS.has(request.nextUrl.pathname) &&
  !claims
) {
  const url = request.nextUrl.clone()
  url.pathname = "/admin/login"
  url.search = ""
  return redirectWithSupabaseCookies(url, supabaseResponse)
}
```

Root `proxy.ts`:

```ts
import { type NextRequest } from "next/server"
import { updateSupabaseSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request)
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/internal/melhor-envio/oauth/start",
  ],
}
```

The proxy must **not** touch `admin_sessions`; activity is refreshed only by explicit protected page/API authorization calls.

- [ ] **Step 5: Run focused tests, typecheck, and build**

```bash
node --experimental-strip-types --test tests/admin-auth-ssr.test.ts
pnpm typecheck
pnpm build
```

Expected: PASS and Next.js recognizes `proxy.ts` without middleware/proxy conflicts.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/client.ts lib/supabase/server.ts lib/supabase/proxy.ts proxy.ts tests/admin-auth-ssr.test.ts
git commit -m "feat: add Supabase SSR auth session plumbing"
```

---

### Task 3: Add atomic backend-only administrative session persistence

**Files:**
- Create: `supabase/migrations/202608310001_admin_sessions.sql`
- Create: `lib/server/admin-session-repository.ts`
- Create: `tests/admin-session-migration.test.ts`
- Create: `tests/admin-session-repository.test.ts`

**Interfaces:**

```ts
export type AdminSessionStatus = "active" | "missing" | "revoked" | "expired"

export async function activateAdminSession(input: {
  authSessionId: string
  userId: string
}): Promise<string | null>

export async function authorizeAdminSession(input: {
  authSessionId: string
  userId: string
  touch: boolean
}): Promise<AdminSessionStatus>

export async function revokeAdminSession(input: {
  authSessionId: string
  userId: string
}): Promise<boolean>
```

- [ ] **Step 1: Write the failing migration contract test**

`tests/admin-session-migration.test.ts` must assert the table, RLS, one-active-session index, exact timeout, and three privileged functions:

```ts
const RPCS = ["activate_admin_session", "authorize_admin_session", "revoke_admin_session"] as const

assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.admin_sessions/)
assert.match(sql, /auth_session_id\s+uuid\s+not\s+null\s+unique/)
assert.match(sql, /user_id\s+uuid\s+not\s+null/)
assert.match(sql, /last_activity_at\s+timestamptz\s+not\s+null/)
assert.match(sql, /revoked_at\s+timestamptz/)
assert.match(sql, /where\s+revoked_at\s+is\s+null/)
assert.match(sql, /interval\s+'30 minutes'/)
```

For every RPC assert `SECURITY DEFINER`, `SET search_path = ''`, execute revoked from `PUBLIC, anon, authenticated`, and granted to `service_role` only.

- [ ] **Step 2: Run the migration test and verify RED**

```bash
node --experimental-strip-types --test tests/admin-session-migration.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement the migration with atomic one-session and inactivity rules**

Create the table and unique partial index:

```sql
create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  auth_session_id uuid not null unique,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists admin_sessions_one_active_per_user
  on public.admin_sessions(user_id)
  where revoked_at is null;

alter table public.admin_sessions enable row level security;
revoke all on table public.admin_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_sessions to service_role;
```

`activate_admin_session` must take a transaction-level advisory lock for the user, refuse reuse of a previously revoked/expired `auth_session_id`, revoke any other active session, and insert the new row:

```sql
perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

select id, last_activity_at, revoked_at
into v_existing_id, v_existing_last_activity, v_existing_revoked_at
from public.admin_sessions
where auth_session_id = p_auth_session_id and user_id = p_user_id
for update;

if found then
  if v_existing_revoked_at is null
     and v_existing_last_activity > now() - interval '30 minutes' then
    return v_existing_id;
  end if;
  return null;
end if;

update public.admin_sessions
set revoked_at = now()
where user_id = p_user_id and revoked_at is null;

insert into public.admin_sessions(auth_session_id, user_id)
values (p_auth_session_id, p_user_id)
returning id into v_new_id;
return v_new_id;
```

`authorize_admin_session` must lock the matching row, return `missing` when absent, `revoked` when already revoked, atomically set `revoked_at=now()` and return `expired` when `last_activity_at <= now() - interval '30 minutes'`, otherwise optionally touch `last_activity_at=now()` and return `active`.

`revoke_admin_session` must set `revoked_at=now()` only for the matching currently-active row and return whether one row changed.

- [ ] **Step 4: Run the migration contract test GREEN**

```bash
node --experimental-strip-types --test tests/admin-session-migration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing repository tests**

Mock `globalThis.fetch` and assert exact PostgREST RPC calls:

```ts
assert.equal(url.pathname, "/rest/v1/rpc/authorize_admin_session")
assert.deepEqual(JSON.parse(String(init?.body)), {
  p_auth_session_id: SESSION_ID,
  p_user_id: USER_ID,
  p_touch: true,
})
```

Cover `active`, `missing`, `revoked`, `expired`, activation UUID/null, revoke boolean, malformed responses, non-2xx responses, and network failure. Errors must be sanitized as `Admin session repository request failed` or `Invalid admin session repository response` without provider/database bodies.

- [ ] **Step 6: Implement the repository using the existing server-only Supabase REST pattern**

Use `getSupabaseEnv()` and the same 10-second request timeout style as other server repositories:

```ts
headers.set("apikey", env.supabaseSecretKey)
headers.set("Content-Type", "application/json")

const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${name}`, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
  cache: "no-store",
  signal: AbortSignal.timeout(10_000),
})
```

Strictly parse only the documented UUID/null, status union, and boolean return types.

- [ ] **Step 7: Run repository tests and typecheck**

```bash
node --experimental-strip-types --test tests/admin-session-migration.test.ts tests/admin-session-repository.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit the migration and repository before applying the migration remotely**

```bash
git add supabase/migrations/202608310001_admin_sessions.sql lib/server/admin-session-repository.ts tests/admin-session-migration.test.ts tests/admin-session-repository.test.ts
git commit -m "feat: add server-enforced admin sessions"
```

---

### Task 4: Add pure owner/AAL/fresh-MFA claim validation

**Files:**
- Create: `lib/server/admin-auth-core.ts`
- Create: `tests/admin-auth-core.test.ts`

**Interfaces:**

```ts
export interface AdminPrincipal {
  userId: string
  authSessionId: string
  aal: "aal1" | "aal2"
}

export type AdminIdentityResult =
  | { ok: true; principal: AdminPrincipal }
  | { ok: false; reason: "unauthenticated" | "not_admin" | "mfa_required" | "invalid_session" }

export function validateAdminIdentity(input: {
  claims: unknown
  adminUserId: string
  requireAal2: boolean
}): AdminIdentityResult

export function hasFreshPasswordAndTotp(input: {
  claims: unknown
  nowSeconds: number
  maxAgeSeconds?: number
}): boolean
```

- [ ] **Step 1: Write RED claim-validation tests**

Cover missing claims, anonymous claims, wrong UUID, missing/invalid `session_id`, `aal1` rejection when `requireAal2=true`, accepted owner `aal1` for the MFA flow, and accepted owner `aal2` for protected access:

```ts
const validAal2Claims = {
  sub: USER_ID,
  session_id: SESSION_ID,
  aal: "aal2",
  is_anonymous: false,
  amr: [
    { method: "totp", timestamp: 1_700_000_050 },
    { method: "password", timestamp: 1_700_000_000 },
  ],
}
```

For freshness, assert both `password` and `totp` must exist and each timestamp must be between `nowSeconds - 600` and `nowSeconds`. Missing, future, malformed, or 601-second-old entries return `false`.

- [ ] **Step 2: Run the test and verify RED**

```bash
node --experimental-strip-types --test tests/admin-auth-core.test.ts
```

Expected: FAIL because the core module does not exist.

- [ ] **Step 3: Implement strict claim parsing**

Use object/type guards only; do not trust arbitrary cookie/session objects:

```ts
if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
  return { ok: false, reason: "unauthenticated" }
}

const row = claims as Record<string, unknown>
if (row.is_anonymous === true) return { ok: false, reason: "unauthenticated" }
if (row.sub !== input.adminUserId) return { ok: false, reason: "not_admin" }
if (typeof row.session_id !== "string" || !UUID_RE.test(row.session_id)) {
  return { ok: false, reason: "invalid_session" }
}
if (row.aal !== "aal1" && row.aal !== "aal2") {
  return { ok: false, reason: "invalid_session" }
}
if (input.requireAal2 && row.aal !== "aal2") {
  return { ok: false, reason: "mfa_required" }
}
```

Fresh AMR checking must iterate the array and require a recent timestamp for both methods:

```ts
const fresh = (method: "password" | "totp") =>
  amr.some((entry) =>
    isAmrEntry(entry) &&
    entry.method === method &&
    entry.timestamp <= input.nowSeconds &&
    entry.timestamp >= input.nowSeconds - maxAgeSeconds,
  )

return fresh("password") && fresh("totp")
```

- [ ] **Step 4: Run focused tests and typecheck**

```bash
node --experimental-strip-types --test tests/admin-auth-core.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/admin-auth-core.ts tests/admin-auth-core.test.ts
git commit -m "feat: validate admin MFA identity claims"
```

---

### Task 5: Add the shared server authorization boundary

**Files:**
- Create: `lib/server/admin-auth.ts`
- Create: `tests/admin-auth.test.ts`
- Create: `app/admin/error.tsx`

**Interfaces:**

```ts
export type AdminAccessFailure =
  | "unauthenticated"
  | "not_admin"
  | "mfa_required"
  | "invalid_session"
  | "session_missing"
  | "session_revoked"
  | "session_expired"
  | "fresh_login_required"
  | "session_reused"
  | "unavailable"

export type AdminAccessResult =
  | { ok: true; principal: AdminPrincipal }
  | { ok: false; reason: AdminAccessFailure }

export async function authorizeAdminAccess(input?: { touch?: boolean }): Promise<AdminAccessResult>
export async function activateCurrentAdminSession(): Promise<AdminAccessResult>
export async function revokeCurrentAdminSession(): Promise<void>
export async function requireAdminPageAccess(input?: { touch?: boolean }): Promise<AdminPrincipal>
```

The file also exports dependency-injected equivalents for unit tests; production wrappers create a request-scoped Supabase client and use `getClaims()`.

- [ ] **Step 1: Write RED orchestration tests with injected dependencies**

Create a fake dependency object:

```ts
const deps = {
  adminUserId: USER_ID,
  nowSeconds: () => 1_700_000_100,
  getClaims: async () => validAal2Claims,
  signOut: async () => { signedOut += 1 },
  authorizeSession: async () => "active" as const,
  activateSession: async () => ADMIN_SESSION_ID,
  revokeSession: async () => true,
}
```

Assert:

- owner + `aal2` + `active` succeeds;
- `aal1` returns `mfa_required` without calling admin-session RPC;
- wrong UUID returns `not_admin` and signs out;
- `missing`, `revoked`, and `expired` admin-session statuses fail and sign out;
- repository/auth errors return `unavailable` and never authorize;
- `touch:false` is forwarded unchanged;
- activation requires `aal2` plus fresh password/TOTP;
- 601-second-old AMR returns `fresh_login_required` and signs out;
- activation returning `null` returns `session_reused` and signs out;
- logout attempts admin-session revocation and clears the Supabase browser session even if revocation throws.

- [ ] **Step 2: Run the test and verify RED**

```bash
node --experimental-strip-types --test tests/admin-auth.test.ts
```

Expected: FAIL because `lib/server/admin-auth.ts` does not exist.

- [ ] **Step 3: Implement injected authorization and activation logic**

Authorization logic:

```ts
const identity = validateAdminIdentity({
  claims,
  adminUserId: deps.adminUserId,
  requireAal2: true,
})
if (!identity.ok) return failIdentity(identity.reason)

let status: AdminSessionStatus
try {
  status = await deps.authorizeSession({
    authSessionId: identity.principal.authSessionId,
    userId: identity.principal.userId,
    touch: input.touch ?? true,
  })
} catch {
  return { ok: false, reason: "unavailable" }
}

if (status === "active") return { ok: true, principal: identity.principal }
await safeSignOut(deps)
return { ok: false, reason: `session_${status}` as const }
```

Activation must check the AMR freshness **before** calling `activateSession`:

```ts
if (!hasFreshPasswordAndTotp({ claims, nowSeconds: deps.nowSeconds(), maxAgeSeconds: 600 })) {
  await safeSignOut(deps)
  return { ok: false, reason: "fresh_login_required" }
}
```

- [ ] **Step 4: Implement production wrappers with verified claims**

Create a new Supabase server client per call and use only:

```ts
const { data, error } = await supabase.auth.getClaims()
if (error) return null
return data?.claims ?? null
```

For cookie clearing use local sign-out because the app-owned `admin_sessions` record is the authoritative admin-access revocation layer:

```ts
await supabase.auth.signOut({ scope: "local" })
```

`requireAdminPageAccess()` maps `mfa_required` to `/admin/mfa`, normal unauthenticated/session-ended states to `/admin/login`, and throws for `unavailable` so `app/admin/error.tsx` renders a generic fail-closed message. It must never render protected children on an error path.

- [ ] **Step 5: Add the generic admin error boundary**

`app/admin/error.tsx` is a Client Component with no error details:

```tsx
"use client"

export default function AdminError() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-6 py-12">
      <h1 className="text-2xl font-semibold">Área administrativa indisponível</h1>
      <p className="text-sm text-muted-foreground">
        Não foi possível validar o acesso administrativo. Tente entrar novamente.
      </p>
      <a href="/admin/login" className="underline">Voltar ao login</a>
    </main>
  )
}
```

- [ ] **Step 6: Run focused tests and typecheck**

```bash
node --experimental-strip-types --test tests/admin-auth-core.test.ts tests/admin-auth.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/server/admin-auth.ts tests/admin-auth.test.ts app/admin/error.tsx
git commit -m "feat: enforce shared admin authorization"
```

---

### Task 6: Build password login, TOTP enrollment/challenge, activation, and logout UI

**Files:**
- Create: `app/admin/login/page.tsx`
- Create: `app/admin/login/login-form.tsx`
- Create: `app/admin/setup-mfa/page.tsx`
- Create: `app/admin/setup-mfa/setup-mfa-form.tsx`
- Create: `app/admin/mfa/page.tsx`
- Create: `app/admin/mfa/mfa-form.tsx`
- Create: `app/api/admin/session/activate/route.ts`
- Create: `app/api/admin/logout/route.ts`
- Create: `tests/admin-auth-ui.test.ts`

**Interfaces:**

- Login: `email + password -> Supabase aal1 -> /admin/mfa`.
- First setup: `/admin/mfa` detects no verified TOTP factor and redirects to `/admin/setup-mfa`.
- TOTP verification: `challenge -> verify -> POST /api/admin/session/activate -> /admin`.
- Logout: `POST /api/admin/logout -> revoke admin session -> Supabase local sign-out -> /admin/login`.

- [ ] **Step 1: Write RED UI/security source-contract tests**

`tests/admin-auth-ui.test.ts` must assert:

```ts
assert.match(loginSource, /type=["']email["']/)
assert.match(loginSource, /type=["']password["']/)
assert.match(loginSource, /signInWithPassword/)
assert.doesNotMatch(loginSource, /signUp|signup|Cadastrar|Criar conta/)

assert.match(mfaSource, /challenge/)
assert.match(mfaSource, /verify/)
assert.match(mfaSource, /\/api\/admin\/session\/activate/)

assert.match(setupSource, /factorType:\s*["']totp["']/)
assert.doesNotMatch(setupSource, /phone|sms|trusted device|lembrar/i)
```

Also assert none of the Client Components contains `ADMIN_USER_ID`, `SUPABASE_SECRET_KEY`, `service_role`, `MELHOR_ENVIO_`, or `localStorage`.

- [ ] **Step 2: Run the test and verify RED**

```bash
node --experimental-strip-types --test tests/admin-auth-ui.test.ts
```

Expected: FAIL because the admin auth UI files do not exist.

- [ ] **Step 3: Implement the password-only first factor login**

`login-form.tsx` uses the browser client directly; there is no signup action:

```tsx
"use client"

const supabase = createSupabaseBrowserClient()
const { error } = await supabase.auth.signInWithPassword({ email, password })
if (error) {
  setMessage("Não foi possível entrar. Verifique os dados e tente novamente.")
  return
}
window.location.assign("/admin/mfa")
```

Inputs use `autoComplete="username"` and `autoComplete="current-password"`; do not log form values or Supabase errors.

`/admin/login` is `force-dynamic`, has no registration/reset link in this scope, and may redirect to `/admin` only when `authorizeAdminAccess({ touch: false })` already returns an active admin session.

- [ ] **Step 4: Implement MFA routing and first-time TOTP enrollment**

`/admin/mfa` creates the server client, validates the authenticated UUID at `aal1` or `aal2`, calls `supabase.auth.mfa.listFactors()`, and redirects to `/admin/setup-mfa` when there is no verified TOTP factor.

`setup-mfa-form.tsx` starts enrollment only after a user click to avoid duplicate enroll calls:

```ts
const { data, error } = await supabase.auth.mfa.enroll({
  factorType: "totp",
  friendlyName: "ProxyBembem Admin",
})
if (error) return setMessage("Não foi possível iniciar o Authenticator.")
setFactorId(data.id)
setQrCode(data.totp.qr_code)
```

Render the returned QR code in an `<img>` and never log/store the enrollment secret. Verify exactly six digits:

```ts
if (!/^\d{6}$/.test(code)) return setMessage("Digite o código de 6 dígitos.")
const challenge = await supabase.auth.mfa.challenge({ factorId })
if (challenge.error) return setMessage("Código inválido. Tente novamente.")
const verify = await supabase.auth.mfa.verify({
  factorId,
  challengeId: challenge.data.id,
  code,
})
if (verify.error) return setMessage("Código inválido. Tente novamente.")
```

Then call the activation endpoint and navigate to `/admin` only on HTTP 204.

- [ ] **Step 5: Implement normal TOTP challenge**

The server page selects a verified TOTP factor and passes only its factor ID to the Client Component. `mfa-form.tsx` performs `challenge()` then `verify()` with the 6-digit code, then:

```ts
const response = await fetch("/api/admin/session/activate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "same-origin",
})
if (response.status !== 204) {
  await supabase.auth.signOut({ scope: "local" })
  window.location.assign("/admin/login")
  return
}
window.location.assign("/admin")
```

If the page is reached with a fresh `aal2` session after a browser reload, render a `Continuar` action that calls the same activation endpoint; the server's 10-minute AMR freshness rule decides whether activation is still allowed.

- [ ] **Step 6: Implement same-origin activation and logout routes**

Both POST routes reject missing/cross-site `Origin`. Reuse `resolvePublicSiteUrl()` + `isAllowedCheckoutOrigin()`.

Activation mapping:

```ts
const result = await activateCurrentAdminSession()
if (result.ok) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
if (result.reason === "unavailable") return new Response(null, { status: 503 })
if (result.reason === "not_admin") return new Response(null, { status: 403 })
return new Response(null, { status: 401 })
```

Logout calls `revokeCurrentAdminSession()` in a `try/finally` path so the local Supabase session is cleared even when the repository is unavailable, then returns a 303 redirect to `/admin/login`. Responses use `Cache-Control: private, no-store`.

- [ ] **Step 7: Run focused tests, typecheck, and build**

```bash
node --experimental-strip-types --test tests/admin-auth-ui.test.ts tests/admin-auth.test.ts
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/admin/login app/admin/setup-mfa app/admin/mfa app/api/admin lib/server/admin-auth.ts tests/admin-auth-ui.test.ts
git commit -m "feat: add mandatory TOTP admin login"
```

---

### Task 7: Protect the admin landing page and replace Melhor Envio's manual secret gate

**Files:**
- Create: `app/admin/page.tsx`
- Create: `lib/server/melhor-envio-oauth-start.ts`
- Modify: `app/admin/integrations/melhor-envio/page.tsx`
- Modify: `app/api/internal/melhor-envio/oauth/start/route.ts`
- Modify: `lib/server/env.ts`
- Modify: `.env.example`
- Modify: `tests/melhor-envio-env.test.ts`
- Modify: `tests/melhor-envio-oauth-routes.test.ts`

**Interfaces:**

```ts
export interface MelhorEnvioOAuthStartDependencies {
  authorizeAdmin(): Promise<AdminAccessResult>
  consumeRateLimit(request: NextRequest): Promise<boolean>
  createOAuthState(input: { stateHash: string; environment: MelhorEnvioEnvironment; expiresAt: string }): Promise<void>
}

export function createMelhorEnvioOAuthStartHandler(
  deps: MelhorEnvioOAuthStartDependencies,
): (request: NextRequest) => Promise<Response>
```

- [ ] **Step 1: Rewrite the existing OAuth-route tests to expect authenticated admin access**

Replace owner-secret fixtures with injected auth results. Keep the existing cross-site, rate-limit, SHA-256 state, 10-minute expiry, and least-privilege authorization assertions.

Add cases:

```ts
const denied = createMelhorEnvioOAuthStartHandler({
  ...deps,
  authorizeAdmin: async () => ({ ok: false, reason: "mfa_required" }),
})
assert.equal((await denied(startRequest())).status, 401)

const unavailable = createMelhorEnvioOAuthStartHandler({
  ...deps,
  authorizeAdmin: async () => ({ ok: false, reason: "unavailable" }),
})
assert.equal((await unavailable(startRequest())).status, 503)
```

The integration page source test must now assert `adminSecret`/password input is absent and a protected access helper is present.

- [ ] **Step 2: Run OAuth/env tests and verify RED**

```bash
node --experimental-strip-types --test tests/melhor-envio-oauth-routes.test.ts tests/melhor-envio-env.test.ts
```

Expected: FAIL because the route still requires `MELHOR_ENVIO_OAUTH_ADMIN_SECRET`.

- [ ] **Step 3: Protect the admin pages with the shared server guard**

`app/admin/page.tsx`:

```tsx
import { requireAdminPageAccess } from "@/lib/server/admin-auth"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  await requireAdminPageAccess({ touch: true })
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">Administração</h1>
      <a href="/admin/integrations/melhor-envio" className="underline">Integração Melhor Envio</a>
      <form method="post" action="/api/admin/logout">
        <button type="submit" className="rounded-md border px-4 py-2">Sair</button>
      </form>
    </main>
  )
}
```

At the top of the existing Melhor Envio integration page call the same guard with `touch:true`. Replace the secret field with a single POST button:

```tsx
<form method="post" action="/api/internal/melhor-envio/oauth/start">
  <button type="submit" className="rounded-md border px-4 py-2 text-sm font-medium">
    Conectar Melhor Envio
  </button>
</form>
```

- [ ] **Step 4: Move OAuth-start logic into the injectable server handler**

Preserve this order:

```text
same-origin check -> rate limit -> admin AAL2/session authorization -> load Melhor Envio env -> generate/store one-shot state -> provider redirect
```

No request body or `adminSecret` is parsed. Map admin failures to 401/403/503 without returning details.

`app/api/internal/melhor-envio/oauth/start/route.ts` becomes only the production wiring:

```ts
export const runtime = "nodejs"

export const POST = createMelhorEnvioOAuthStartHandler({
  authorizeAdmin: () => authorizeAdminAccess({ touch: true }),
  consumeRateLimit: (request) => consumeRateLimit({ request, scope: "melhor-envio-oauth-start" }),
  createOAuthState,
})
```

The handler still uses the existing state/client/env functions for all other behavior.

- [ ] **Step 5: Remove the obsolete manual admin-secret environment requirement**

Delete `oauthAdminSecret` from `MelhorEnvioOAuthEnv` and `getMelhorEnvioOAuthEnv()`. Remove `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` from `.env.example` and test fixtures. Do **not** delete `lib/server/secret-compare.ts`; the authenticated Cron route still uses it for `CRON_SECRET`.

- [ ] **Step 6: Run focused and regression tests**

```bash
node --experimental-strip-types --test tests/melhor-envio-oauth-routes.test.ts tests/melhor-envio-env.test.ts tests/melhor-envio-oauth-callback-origin.test.ts tests/melhor-envio-cron.test.ts tests/admin-auth-ui.test.ts tests/admin-auth.test.ts
pnpm typecheck
```

Expected: PASS. Existing callback tests continue proving state protection without requiring an admin browser session.

- [ ] **Step 7: Commit**

```bash
git add app/admin/page.tsx app/admin/integrations/melhor-envio/page.tsx app/api/internal/melhor-envio/oauth/start/route.ts lib/server/melhor-envio-oauth-start.ts lib/server/env.ts .env.example tests/melhor-envio-env.test.ts tests/melhor-envio-oauth-routes.test.ts
git commit -m "feat: protect Melhor Envio admin flow with MFA"
```

---

### Task 8: Add complete security regression coverage and operator documentation

**Files:**
- Modify: `tests/admin-auth-ui.test.ts`
- Modify: `tests/admin-auth.test.ts`
- Modify: `tests/admin-session-migration.test.ts`
- Modify: `docs/shipping-setup.md`
- Modify: `.env.example` only if the final test reveals a contract mismatch

- [ ] **Step 1: Add regression assertions for all approved bypass cases**

Ensure the automated suite explicitly proves:

```ts
// Password-only is insufficient.
assert.deepEqual(await authorizeWith({ claims: aal1Claims }), {
  ok: false,
  reason: "mfa_required",
})

// An expired admin session fails even with a valid aal2 JWT.
assert.deepEqual(await authorizeWith({ adminSessionStatus: "expired" }), {
  ok: false,
  reason: "session_expired",
})

// A revoked Supabase session_id cannot be reactivated through the activation path.
assert.deepEqual(await activateWith({ activateSessionResult: null }), {
  ok: false,
  reason: "session_reused",
})

// Background checks do not touch inactivity.
assert.equal(capturedAuthorizeInput.touch, false)
```

Also assert only `touch:true` interactive page/API calls refresh activity; proxy refresh and future background checks do not.

- [ ] **Step 2: Update the Melhor Envio setup runbook**

Document the new operator flow without secret values:

```text
/admin/login -> email + password -> Authenticator code -> /admin -> Integração Melhor Envio -> Conectar Melhor Envio
```

State that `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` is obsolete, TOTP recovery is manual through Supabase administration, and Preview/Production accounts/credentials remain separate.

- [ ] **Step 3: Run the entire repository verification gate**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 4: Inspect the final diff for secret/cookie logging**

Run:

```bash
git diff --check
git grep -nE 'console\.(log|error).*?(password|totp|access.?token|refresh.?token|cookie|SUPABASE_SECRET_KEY|ADMIN_USER_ID)' -- ':!docs/superpowers/plans/2026-08-31-admin-auth-mfa.md'
```

Expected: `git diff --check` exits 0; the grep produces no new runtime logging of sensitive auth material.

- [ ] **Step 5: Commit documentation/regression changes**

```bash
git add tests/admin-auth-ui.test.ts tests/admin-auth.test.ts tests/admin-session-migration.test.ts docs/shipping-setup.md .env.example
git commit -m "test: harden admin MFA access rules"
```

---

### Task 9: Apply the migration and provision the sole Preview admin safely

**Files:**
- No code changes until acceptance evidence is known.

**Interfaces:**
- Remote migration name: `admin_sessions`.
- Required Preview environment names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ADMIN_USER_ID`.
- Existing server `SUPABASE_URL` / `SUPABASE_SECRET_KEY` remain server-only.

- [ ] **Step 1: Apply the committed migration to the existing Preview/Sandbox Supabase project**

Use `Supabase.apply_migration` with `name: "admin_sessions"` and the exact contents of `supabase/migrations/202608310001_admin_sessions.sql`.

Then use `Supabase.list_migrations` and confirm the new migration appears after the six existing migrations.

- [ ] **Step 2: Run Supabase security advisors after DDL**

Use `Supabase.get_advisors(type="security")` and verify there is no new warning indicating public/anon/authenticated access to `admin_sessions` or its RPCs.

- [ ] **Step 3: Disable public signup in the Supabase Auth project settings**

In Supabase Dashboard, set the email Auth configuration so new user signup is disabled. Keep email/password sign-in enabled for the manually provisioned admin.

No public signup route/component is added to the site regardless of dashboard configuration.

- [ ] **Step 4: Provision exactly one admin user manually**

In Supabase Dashboard → Authentication → Users, create the owner's admin email/password account. The owner enters the password directly in Supabase; it is never pasted into chat, committed, logged, or stored in previous hosting provider variables.

Verify exactly one Auth user exists with:

```sql
select id, email, created_at
from auth.users
order by created_at;
```

Expected: one row.

- [ ] **Step 5: Resolve the immutable UUID and configure Preview only**

Use the `id` returned above as `ADMIN_USER_ID`.

Configure these previous hosting provider **Preview** variables without exposing their values in logs/chat:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ADMIN_USER_ID
```

Keep `SUPABASE_SECRET_KEY` server-only. Do not add any of these changes to Production yet.

- [ ] **Step 6: Redeploy the feature branch Preview**

Trigger a fresh preview environment deployment from the current feature-branch HEAD and verify state `READY` before browser acceptance.

---

### Task 10: Perform Preview/Sandbox acceptance, then record status

**Files:**
- Modify after successful acceptance: `docs/superpowers/CURRENT_STATUS.md`

- [ ] **Step 1: Complete first-time password + TOTP enrollment**

Open `/admin/login`, enter the sole admin email/password, reach `/admin/setup-mfa`, scan the QR code with the owner's Authenticator app, enter the 6-digit code, and verify `/admin` loads only after activation.

Expected database evidence:

```sql
select user_id, auth_session_id, created_at, last_activity_at, revoked_at
from public.admin_sessions
order by created_at desc;
```

Expected: exactly one active row (`revoked_at is null`) for the owner.

- [ ] **Step 2: Prove password-only cannot reach protected admin content**

Sign out, sign in with email/password, stop before entering TOTP, then directly request `/admin` and `/admin/integrations/melhor-envio`.

Expected: protected content is not rendered; flow returns to `/admin/mfa`.

- [ ] **Step 3: Prove invalid TOTP cannot activate an admin session**

Submit an incorrect 6-digit code.

Expected: no new active `admin_sessions` row and `/admin` remains inaccessible.

- [ ] **Step 4: Prove exact inactivity expiration without waiting 30 minutes**

After a valid login, age the sole active row in Preview only:

```sql
update public.admin_sessions
set last_activity_at = now() - interval '31 minutes'
where revoked_at is null;
```

Then make the next protected admin request.

Expected: access is denied, the row receives `revoked_at`, the browser returns to `/admin/login`, and re-entry requires password + a new TOTP code.

- [ ] **Step 5: Prove one active session and old-session non-reactivation**

Login successfully in browser A. Then perform a fresh password + TOTP login in browser B.

Expected database query:

```sql
select auth_session_id, created_at, revoked_at
from public.admin_sessions
order by created_at desc;
```

Expected: browser B's row is the only row with `revoked_at is null`; browser A is denied on its next protected request. A direct activation attempt from browser A's old `session_id` must fail and must not revoke browser B's active row.

- [ ] **Step 6: Verify logout revokes the admin layer**

Use the `/admin` logout button.

Expected: current row gets `revoked_at`, Supabase browser session is cleared, and direct navigation to `/admin` returns to login.

- [ ] **Step 7: Revalidate Melhor Envio OAuth through the authenticated page**

After a fresh password + TOTP login, open `/admin/integrations/melhor-envio` and use `Conectar Melhor Envio`.

Expected: existing Sandbox authorization/callback succeeds, token storage remains encrypted, and the callback redirects to the integration page with `status=connected`. No manual admin secret field is present.

- [ ] **Step 8: Review Preview runtime logs and final CI**

Check the acceptance deployment logs for warning/error/fatal auth failures and confirm no password, TOTP, Auth cookie, JWT, refresh token, service key, or Melhor Envio token appears in logs.

Run or confirm fresh CI for the final HEAD:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all PASS.

- [ ] **Step 9: Update canonical continuity status and commit**

Update `docs/superpowers/CURRENT_STATUS.md` with:

```text
Admin Auth foundation complete in Preview:
- single owner UUID
- password + mandatory TOTP/AAL2
- 30-minute server-side inactivity
- one active admin session
- revoked session_id cannot reactivate
- Melhor Envio admin-secret field removed
- Preview acceptance and CI evidence recorded
```

Do not mark Production complete and do not merge to `main`.

Commit:

```bash
git add docs/superpowers/CURRENT_STATUS.md
git commit -m "docs: record admin MFA Preview acceptance"
```

---

## Plan self-review result

- **Spec coverage:** All approved requirements are mapped to Tasks 1–10: single owner, password, mandatory TOTP/AAL2, no signup/bypass, server-side inactivity, one-session enforcement, fail-closed behavior, Melhor Envio migration, logout, recovery policy, tests, and Preview-only rollout.
- **Reactivation hardening:** The plan closes the old-`aal2` reactivation edge by combining one-use `auth_session_id` records with a 10-minute password+TOTP `amr` activation window.
- **Secret boundary:** Browser files receive only the Supabase URL/publishable key; `SUPABASE_SECRET_KEY` and `ADMIN_USER_ID` remain server-only.
- **Timeout semantics:** Only explicit interactive page/API authorization uses `touch:true`; proxy/session refresh and future background polling do not extend admin activity.
- **Migration safety:** Migration is committed/tested before remote application, with RLS/grants and security-advisor verification.
- **Rollout:** Production and `main` remain untouched until explicit owner approval.
