# Melhor Envio OAuth Single-Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static Melhor Envio Bearer token with a single-account OAuth 2.0 lifecycle that encrypts tokens, refreshes them automatically and safely, and keeps freight quotation functional without exposing credentials.

**Architecture:** The storefront remains quote-only and server-authoritative. A dedicated OAuth client exchanges/refreshes credentials; a token manager reads encrypted token state from Supabase, coordinates refresh with database leases and token versions, and hands a current Bearer token to the existing freight client. Owner authorization is a protected one-account bootstrap flow, while a daily Vercel Cron invokes the same token manager so low traffic cannot let refresh state go stale.

**Tech Stack:** Next.js 16.3.3 App Router, TypeScript 5.7.3, Node.js `node:crypto`, Supabase/PostgreSQL REST + RPC, Melhor Envio OAuth 2.0/API v2, Vercel Cron, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-29-melhor-envio-oauth-single-account-design.md`

## Global Constraints

- Work only on `feat/checkout-mercadopago`; do not merge or modify `main` without explicit owner approval.
- This integration serves one ProxyBembem store and one Melhor Envio account per environment; no multi-tenant account model.
- Request exactly the `shipping-calculate` scope while labels remain manual.
- Production and Sandbox credentials/tokens never fall back to each other.
- Never expose Client Secret, access token, refresh token, encryption key, owner bootstrap secret, OAuth code/state, or cron secret in browser responses, client bundles, logs, repository files, or screenshots.
- Persist access/refresh tokens only as AES-256-GCM authenticated ciphertext with AAD bound to environment and token kind.
- OAuth state is at least 256 bits random, persisted only as SHA-256, expires after 10 minutes, and is atomically single-use.
- A known provider-rejected access token is never reused during a forced-refresh race.
- Provider authentication failure gets at most one retry after a successful coordinated refresh.
- RLS remains enabled with no `anon`/`authenticated` policies on OAuth tables; privileged RPC execution is denied to `PUBLIC`, `anon`, and `authenticated`.
- Production callback must be an exact configured HTTPS URL, never inferred from request `Host`/`Origin`.
- A daily Vercel Cron uses `CRON_SECRET` and the same token-manager refresh path; it does not implement a second refresh algorithm.
- Follow RED → GREEN TDD for every business/security behavior and run fresh full verification before completion claims.

---

## Planned file structure

**Create**

- `lib/server/secret-compare.ts` — timing-safe comparison for high-entropy server secrets.
- `lib/server/melhor-envio-token-crypto.ts` — versioned AES-256-GCM token envelopes and AAD binding.
- `lib/server/melhor-envio-oauth-repository.ts` — Supabase table/RPC access for state, credentials and refresh leases.
- `lib/server/melhor-envio-oauth-client.ts` — authorize URL + authorization-code/refresh token exchanges.
- `lib/server/melhor-envio-token-manager.ts` — current-token selection, proactive/forced refresh, concurrency and reauthorization state.
- `app/admin/integrations/melhor-envio/page.tsx` — narrow owner bootstrap/status page.
- `app/api/internal/melhor-envio/oauth/start/route.ts` — protected OAuth start route.
- `app/api/melhor-envio/oauth/callback/route.ts` — one-shot OAuth callback.
- `app/api/internal/melhor-envio/refresh/route.ts` — Vercel Cron maintenance route.
- `supabase/migrations/202608290002_melhor_envio_oauth.sql` — OAuth tables, RLS/grants and atomic RPCs.
- `vercel.json` — daily Production cron registration.
- `tests/secret-compare.test.ts`
- `tests/melhor-envio-token-crypto.test.ts`
- `tests/melhor-envio-oauth-migration.test.ts`
- `tests/melhor-envio-oauth-repository.test.ts`
- `tests/melhor-envio-oauth-client.test.ts`
- `tests/melhor-envio-token-manager.test.ts`
- `tests/melhor-envio-oauth-routes.test.ts`
- `tests/melhor-envio-cron.test.ts`

**Modify**

- `lib/server/env.ts` — replace permanent access-token config with OAuth/key/admin/cron config.
- `lib/server/rate-limit.ts` — add owner OAuth-start rate-limit scope.
- `lib/server/melhor-envio.ts` — obtain Bearer credentials from token manager and perform one forced-refresh retry on documented auth failure.
- `.env.example` — final variable names, no values/secrets.
- `tests/melhor-envio-env.test.ts` — new environment contract.
- `tests/melhor-envio.test.ts` — token-manager integration + 401 retry behavior.
- `tests/rate-limit.test.ts` — OAuth-start policy coverage.
- `docs/shipping-setup.md` — single-account OAuth setup/runbook.

---

### Task 1: Lock the OAuth environment contract and secret comparison

**Files:**
- Modify: `lib/server/env.ts`
- Modify: `tests/melhor-envio-env.test.ts`
- Create: `lib/server/secret-compare.ts`
- Create: `tests/secret-compare.test.ts`

**Interfaces:**
- Produces `getMelhorEnvioOAuthEnv(): MelhorEnvioOAuthEnv` with `environment`, `clientId`, `clientSecret`, `redirectUri`, `tokenEncryptionKey`, `oauthAdminSecret`, `userAgent`, `originCep`, `quoteSecret`.
- Produces `getCronSecret(): string`.
- Produces `timingSafeSecretEqual(candidate: string, expected: string): boolean`.
- `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` is exactly 64 hexadecimal characters (32 bytes).
- `MELHOR_ENVIO_OAUTH_ADMIN_SECRET`, `CRON_SECRET`, and `SHIPPING_QUOTE_SECRET` require at least 32 characters; operational setup will generate 64 hex characters.

- [ ] **Step 1: Replace the old env test fixtures with failing OAuth-contract tests**

Add cases equivalent to:

```ts
const valid = {
  MELHOR_ENVIO_ENVIRONMENT: "sandbox",
  MELHOR_ENVIO_CLIENT_ID: "12345",
  MELHOR_ENVIO_CLIENT_SECRET: "client-secret",
  MELHOR_ENVIO_REDIRECT_URI: "https://preview.example/api/melhor-envio/oauth/callback",
  MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
  MELHOR_ENVIO_OAUTH_ADMIN_SECRET: "b".repeat(64),
  MELHOR_ENVIO_USER_AGENT: "ProxyBembem (contato@proxybembem.com.br)",
  SHIPPING_ORIGIN_CEP: "86730-000",
  SHIPPING_QUOTE_SECRET: "c".repeat(64),
  CRON_SECRET: "d".repeat(64),
}
```

Assert that `MELHOR_ENVIO_ACCESS_TOKEN` is no longer required, invalid 63/65-char or non-hex encryption keys fail, Production redirect requires HTTPS, malformed redirect URLs fail, and short admin/cron/quote secrets fail.

- [ ] **Step 2: Run the focused env test and verify RED**

Run:

```bash
node --experimental-strip-types --test tests/melhor-envio-env.test.ts
```

Expected: FAIL because the current env loader still requires `MELHOR_ENVIO_ACCESS_TOKEN` and does not expose the OAuth fields.

- [ ] **Step 3: Implement the new env contract minimally**

Use explicit interfaces and validation:

```ts
export interface MelhorEnvioOAuthEnv {
  environment: MelhorEnvioEnvironment
  clientId: string
  clientSecret: string
  redirectUri: string
  tokenEncryptionKey: string
  oauthAdminSecret: string
  userAgent: string
  originCep: string
  quoteSecret: string
}

export function getCronSecret() {
  const value = required("CRON_SECRET")
  if (value.length < 32) throw new Error("CRON_SECRET must contain at least 32 characters")
  return value
}
```

`getMelhorEnvioOAuthEnv()` must parse `MELHOR_ENVIO_REDIRECT_URI` with `new URL`, require `https:` when environment is `production`, normalize CEP to 8 digits, validate `/^[0-9a-fA-F]{64}$/` for the encryption key, and never return an access token.

- [ ] **Step 4: Write the failing timing-safe secret tests**

Test equal secrets, different same-length secrets, and different-length secrets. The helper must return `false`, not throw, for different lengths.

- [ ] **Step 5: Implement timing-safe comparison by hashing both inputs first**

```ts
import { createHash, timingSafeEqual } from "node:crypto"

export function timingSafeSecretEqual(candidate: string, expected: string) {
  const left = createHash("sha256").update(candidate).digest()
  const right = createHash("sha256").update(expected).digest()
  return timingSafeEqual(left, right)
}
```

- [ ] **Step 6: Run focused tests and typecheck**

```bash
node --experimental-strip-types --test tests/melhor-envio-env.test.ts tests/secret-compare.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/server/env.ts lib/server/secret-compare.ts tests/melhor-envio-env.test.ts tests/secret-compare.test.ts
git commit -m "feat: define Melhor Envio OAuth env contract"
```

---

### Task 2: Add authenticated token encryption

**Files:**
- Create: `lib/server/melhor-envio-token-crypto.ts`
- Create: `tests/melhor-envio-token-crypto.test.ts`

**Interfaces:**

```ts
export type MelhorEnvioTokenKind = "access" | "refresh"

export function encryptMelhorEnvioToken(input: {
  plaintext: string
  environment: MelhorEnvioEnvironment
  kind: MelhorEnvioTokenKind
  encryptionKeyHex: string
}): string

export function decryptMelhorEnvioToken(input: {
  envelope: string
  environment: MelhorEnvioEnvironment
  kind: MelhorEnvioTokenKind
  encryptionKeyHex: string
}): string
```

Envelope format: `v1.<iv-base64url>.<ciphertext-base64url>.<tag-base64url>`.
AAD: `proxybembem:melhor-envio:v1:${environment}:${kind}`.

- [ ] **Step 1: Write RED crypto tests**

Cover round-trip, same plaintext producing different envelopes, wrong environment rejection, wrong token-kind rejection, modified ciphertext/tag rejection, unknown version rejection, and malformed envelope rejection.

- [ ] **Step 2: Run the crypto test and verify RED**

```bash
node --experimental-strip-types --test tests/melhor-envio-token-crypto.test.ts
```

Expected: FAIL because the crypto module does not exist.

- [ ] **Step 3: Implement AES-256-GCM**

Use Node primitives only:

```ts
const key = Buffer.from(input.encryptionKeyHex, "hex")
const iv = randomBytes(12)
const cipher = createCipheriv("aes-256-gcm", key, iv)
cipher.setAAD(Buffer.from(aad(input.environment, input.kind), "utf8"))
const ciphertext = Buffer.concat([cipher.update(input.plaintext, "utf8"), cipher.final()])
const tag = cipher.getAuthTag()
```

Decrypt with `createDecipheriv`, the identical AAD, and `setAuthTag`. Convert all cryptographic failures to one sanitized `Error("Invalid Melhor Envio token envelope")` so token content is never echoed.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
node --experimental-strip-types --test tests/melhor-envio-token-crypto.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/melhor-envio-token-crypto.ts tests/melhor-envio-token-crypto.test.ts
git commit -m "feat: encrypt Melhor Envio OAuth tokens"
```

---

### Task 3: Add the OAuth persistence schema and atomic RPCs

**Files:**
- Create: `supabase/migrations/202608290002_melhor_envio_oauth.sql`
- Create: `tests/melhor-envio-oauth-migration.test.ts`

**Interfaces:**

Tables:

```sql
public.melhor_envio_oauth_credentials(
  environment text primary key,
  access_token_envelope text not null,
  refresh_token_envelope text not null,
  access_token_expires_at timestamptz not null,
  token_version bigint not null,
  status text not null,
  refresh_lease_owner text,
  refresh_lease_expires_at timestamptz,
  last_auth_failure_at timestamptz,
  last_auth_failure_code text,
  created_at timestamptz not null,
  updated_at timestamptz not null
)

public.melhor_envio_oauth_states(
  state_hash text primary key,
  environment text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null
)
```

RPCs restricted to `service_role`:

```sql
public.consume_melhor_envio_oauth_state(p_state_hash text, p_environment text) returns boolean
public.claim_melhor_envio_refresh_lease(p_environment text, p_expected_version bigint, p_lease_owner text, p_lease_seconds integer) returns boolean
public.commit_melhor_envio_refresh(p_environment text, p_expected_version bigint, p_lease_owner text, p_access_token_envelope text, p_refresh_token_envelope text, p_access_token_expires_at timestamptz) returns boolean
public.release_melhor_envio_refresh_lease(p_environment text, p_expected_version bigint, p_lease_owner text) returns boolean
public.mark_melhor_envio_reauthorization_required(p_environment text, p_expected_version bigint, p_lease_owner text, p_failure_code text) returns boolean
```

Initial/reauthorization token upsert may be performed by the trusted server role directly, but must reset stale lease fields and increment `token_version` rather than resetting it to an older value.

- [ ] **Step 1: Write a RED migration contract test**

Read the migration as text and assert it contains both tables, `enable row level security`, environment/status checks, the five RPC signatures, fixed `set search_path = ''`, `revoke all ... from public, anon, authenticated`, and `grant execute ... to service_role` for each privileged RPC.

- [ ] **Step 2: Run the migration test and verify RED**

```bash
node --experimental-strip-types --test tests/melhor-envio-oauth-migration.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement tables with fail-closed constraints**

Use checks equivalent to:

```sql
check (environment in ('sandbox', 'production'))
check (status in ('active', 'reauthorization_required'))
check (token_version > 0)
check (char_length(state_hash) = 64)
```

Enable RLS on both tables. Revoke table privileges from `public`, `anon`, `authenticated`; grant only the minimal table operations needed by `service_role`.

- [ ] **Step 4: Implement atomic state consumption**

`consume_melhor_envio_oauth_state` updates exactly one matching row where environment matches, `consumed_at is null`, and `expires_at > now()`, sets `consumed_at=now()`, and returns whether a row changed.

- [ ] **Step 5: Implement lease/version compare-and-set RPCs**

`claim_*` updates only the expected version and only when no non-expired lease exists. `commit_*` updates only when environment + expected version + lease owner match, writes both rotated envelopes and expiry atomically, increments version, clears lease, sets `active`. `release_*` only clears the caller's matching lease/version. `mark_*` only marks the matching leased/version row as `reauthorization_required`, stores a short sanitized failure code, and clears the lease.

- [ ] **Step 6: Run the contract test**

```bash
node --experimental-strip-types --test tests/melhor-envio-oauth-migration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the migration before applying it**

```bash
git add supabase/migrations/202608290002_melhor_envio_oauth.sql tests/melhor-envio-oauth-migration.test.ts
git commit -m "feat: add Melhor Envio OAuth persistence"
```

Do not use ad-hoc DDL. Apply this migration through Supabase migration tooling only after the repository layer is ready for Sandbox verification.

---

### Task 4: Implement the server-only OAuth repository

**Files:**
- Create: `lib/server/melhor-envio-oauth-repository.ts`
- Create: `tests/melhor-envio-oauth-repository.test.ts`

**Interfaces:**

```ts
export interface MelhorEnvioCredentialRecord {
  environment: MelhorEnvioEnvironment
  accessTokenEnvelope: string
  refreshTokenEnvelope: string
  accessTokenExpiresAt: string
  tokenVersion: number
  status: "active" | "reauthorization_required"
  refreshLeaseOwner: string | null
  refreshLeaseExpiresAt: string | null
}

export async function createOAuthState(input: { stateHash: string; environment: MelhorEnvioEnvironment; expiresAt: string }): Promise<void>
export async function consumeOAuthState(input: { stateHash: string; environment: MelhorEnvioEnvironment }): Promise<boolean>
export async function loadCredential(environment: MelhorEnvioEnvironment): Promise<MelhorEnvioCredentialRecord | null>
export async function upsertAuthorizedCredential(input: { environment: MelhorEnvioEnvironment; accessTokenEnvelope: string; refreshTokenEnvelope: string; accessTokenExpiresAt: string }): Promise<void>
export async function claimRefreshLease(input: { environment: MelhorEnvioEnvironment; expectedVersion: number; leaseOwner: string; leaseSeconds: number }): Promise<boolean>
export async function commitRefresh(input: { environment: MelhorEnvioEnvironment; expectedVersion: number; leaseOwner: string; accessTokenEnvelope: string; refreshTokenEnvelope: string; accessTokenExpiresAt: string }): Promise<boolean>
export async function releaseRefreshLease(input: { environment: MelhorEnvioEnvironment; expectedVersion: number; leaseOwner: string }): Promise<boolean>
export async function markReauthorizationRequired(input: { environment: MelhorEnvioEnvironment; expectedVersion: number; leaseOwner: string; failureCode: string }): Promise<boolean>
```

- [ ] **Step 1: Write RED repository tests using mocked `fetch`**

Assert exact Supabase REST/RPC paths, server `apikey`, JSON payload names matching SQL parameters, `Cache-Control: no-store` behavior where applicable, strict response-shape parsing, no secret/provider body copied into thrown messages, and environment-specific credential reads.

- [ ] **Step 2: Run repository tests and verify RED**

```bash
node --experimental-strip-types --test tests/melhor-envio-oauth-repository.test.ts
```

- [ ] **Step 3: Implement a small Supabase request helper inside the repository**

Use `getSupabaseEnv()`, `AbortSignal.timeout(10_000)`, `Accept: application/json`, `Content-Type: application/json`, and the server secret as `apikey`. Do not export generic arbitrary-table helpers.

For credential upsert, use `POST /rest/v1/melhor_envio_oauth_credentials?on_conflict=environment` with `Prefer: resolution=merge-duplicates` and a server-computed next state that clears leases/status failure fields; if safe version increment cannot be guaranteed through direct upsert, add a sixth narrow RPC in the migration and update the migration contract test instead of implementing read-then-write version reset logic.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
node --experimental-strip-types --test tests/melhor-envio-oauth-repository.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/melhor-envio-oauth-repository.ts tests/melhor-envio-oauth-repository.test.ts supabase/migrations/202608290002_melhor_envio_oauth.sql tests/melhor-envio-oauth-migration.test.ts
git commit -m "feat: add Melhor Envio OAuth repository"
```

---

### Task 5: Implement the Melhor Envio OAuth HTTP client

**Files:**
- Create: `lib/server/melhor-envio-oauth-client.ts`
- Create: `tests/melhor-envio-oauth-client.test.ts`

**Interfaces:**

```ts
export interface MelhorEnvioOAuthTokens {
  tokenType: "Bearer"
  accessToken: string
  refreshToken: string
  expiresInSeconds: number
}

export class MelhorEnvioOAuthError extends Error {
  readonly status: number | null
  readonly classification: "unauthenticated" | "provider_error" | "invalid_response"
}

export function buildMelhorEnvioAuthorizationUrl(input: { state: string }): string
export async function exchangeMelhorEnvioAuthorizationCode(code: string): Promise<MelhorEnvioOAuthTokens>
export async function refreshMelhorEnvioTokens(refreshToken: string): Promise<MelhorEnvioOAuthTokens>
```

Provider URLs:
- Sandbox base: `https://sandbox.melhorenvio.com.br`
- Production base: `https://melhorenvio.com.br`
- Authorize: `/oauth/authorize`
- Token: `/oauth/token`
- Scope: exactly `shipping-calculate`

- [ ] **Step 1: Write RED URL and token-exchange tests**

Authorization URL assertions: exact environment host, configured `client_id`, exact configured `redirect_uri`, `response_type=code`, supplied state and scope `shipping-calculate` only.

Token exchange assertions: `grant_type=authorization_code`, Client ID/Secret, exact redirect URI, code and required User-Agent. Refresh assertions: `grant_type=refresh_token`, Client ID/Secret, latest refresh token and required User-Agent.

Use `URLSearchParams` for the OAuth request body and `Content-Type: application/x-www-form-urlencoded` unless live Sandbox verification proves the provider currently requires a different documented encoding; any change must be documented and tested rather than silently guessed.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --experimental-strip-types --test tests/melhor-envio-oauth-client.test.ts
```

- [ ] **Step 3: Implement strict token response parsing**

Accept only a JSON object with `token_type` case-insensitively equal to `Bearer`, non-empty `access_token`, non-empty `refresh_token`, and integer positive `expires_in` within a sane upper bound (for example `<= 90 * 24 * 60 * 60`).

Never include raw body, code, tokens or Client Secret in errors. Map HTTP `401` and provider `Unauthenticated` classification to `unauthenticated`; other HTTP failures to `provider_error`; malformed success bodies to `invalid_response`.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
node --experimental-strip-types --test tests/melhor-envio-oauth-client.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/melhor-envio-oauth-client.ts tests/melhor-envio-oauth-client.test.ts
git commit -m "feat: add Melhor Envio OAuth client"
```

---

### Task 6: Implement the concurrency-safe token manager

**Files:**
- Create: `lib/server/melhor-envio-token-manager.ts`
- Create: `tests/melhor-envio-token-manager.test.ts`

**Interfaces:**

```ts
export interface UsableMelhorEnvioAccessToken {
  accessToken: string
  tokenVersion: number
}

export async function getMelhorEnvioAccessToken(options?: {
  forceRefresh?: boolean
  rejectedTokenVersion?: number
}): Promise<UsableMelhorEnvioAccessToken>
```

Constants:
- Proactive refresh threshold: 7 days remaining.
- Refresh lease: 30 seconds.
- Loser wait: bounded to about 5 seconds with short reload intervals; tests use injected clock/sleep helpers rather than real waiting.

- [ ] **Step 1: Write RED happy-path and proactive-refresh tests**

Cases: valid token with >7 days returns decrypted token and no refresh; <=7 days claims lease and rotates both tokens; committed expiry is `now + expiresInSeconds`; new access/refresh envelopes use correct AAD.

- [ ] **Step 2: Add RED concurrency tests**

Simulate two callers observing version 4. Assert only the lease winner calls `refreshMelhorEnvioTokens`; the loser either uses a still-safe token for proactive refresh or reloads until version >4. Assert stale commit returns false and cannot overwrite version 5.

- [ ] **Step 3: Add RED forced-refresh tests**

If `forceRefresh=true` with `rejectedTokenVersion=4`, the caller must never return version 4 even when its expiry is in the future. A lease loser waits for version >4 or fails with a sanitized temporary-auth error. There is no known-failed-token reuse.

- [ ] **Step 4: Add RED irrecoverable-refresh tests**

Provider refresh `unauthenticated` marks `reauthorization_required`; non-auth transient errors release the lease and fail closed without marking revoked; encryption/decryption failure fails closed and does not fall back to any env access token.

- [ ] **Step 5: Implement manager with injectable internal dependencies for deterministic tests**

Keep public production API small, but structure internal implementation so tests can pass a repository/client/clock/sleep adapter. Generate lease owner with `randomUUID()`. Never log tokens.

Refresh winner flow must be exactly: claim → decrypt refresh → provider refresh → validate → encrypt both → CAS commit. On transient failure, release own lease. On irrecoverable auth failure, mark reauthorization required under the same expected version/lease.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
node --experimental-strip-types --test tests/melhor-envio-token-manager.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/server/melhor-envio-token-manager.ts tests/melhor-envio-token-manager.test.ts
git commit -m "feat: manage Melhor Envio token rotation"
```

---

### Task 7: Add protected owner authorization and callback routes

**Files:**
- Create: `app/admin/integrations/melhor-envio/page.tsx`
- Create: `app/api/internal/melhor-envio/oauth/start/route.ts`
- Create: `app/api/melhor-envio/oauth/callback/route.ts`
- Create: `tests/melhor-envio-oauth-routes.test.ts`
- Modify: `lib/server/rate-limit.ts`
- Modify: `tests/rate-limit.test.ts`

**Interfaces:**
- Admin form: `POST /api/internal/melhor-envio/oauth/start` with form field `adminSecret`.
- Callback: `GET /api/melhor-envio/oauth/callback?code=...&state=...`.
- Rate-limit scope: `melhor-envio-oauth-start`, limit 5 per 900 seconds.

- [ ] **Step 1: Write RED route-security tests**

OAuth start must reject missing/wrong same-origin `Origin`, missing/wrong admin secret, and rate-limit denial; no response body contains the configured secret. Successful start generates a random state, stores only its SHA-256 hash with 10-minute expiry, and redirects to the exact Melhor Envio authorize host.

Callback must reject missing/oversized code/state, provider denial, invalid/expired/replayed state, and wrong environment. A successful callback exchanges the code, computes expiry, encrypts both tokens, stores them, and redirects only to `/admin/integrations/melhor-envio?status=connected`. Failure redirects use a non-sensitive status such as `?status=failed`.

- [ ] **Step 2: Run route tests and verify RED**

```bash
node --experimental-strip-types --test tests/melhor-envio-oauth-routes.test.ts tests/rate-limit.test.ts
```

- [ ] **Step 3: Add the rate-limit policy**

Extend:

```ts
export type RateLimitScope = "shipping-quote" | "checkout" | "melhor-envio-oauth-start"
```

with `{ limit: 5, windowSeconds: 900 }`.

- [ ] **Step 4: Implement the owner page as a minimal server-rendered form**

Use `<input type="password" name="adminSecret" autoComplete="off" required />` and a normal HTTPS POST. Do not persist the value in localStorage/sessionStorage/cookies/application state. The page may display only generic `connected`/`failed` status copy from the query string.

- [ ] **Step 5: Implement OAuth start route**

Check allowed same-origin using the existing production-origin policy, consume rate limit, parse only the expected small form field, timing-safe compare against `oauthAdminSecret`, generate `randomBytes(32).toString("base64url")`, store SHA-256(state), and return `303` to `buildMelhorEnvioAuthorizationUrl({state})`.

- [ ] **Step 6: Implement callback route**

Strictly bound query lengths (`state` 32–256 chars, `code` 1–2048 chars), hash/consume state before token persistence, exchange code server-to-server, encrypt `access` and `refresh` with environment-bound AAD, calculate ISO expiry from `expiresInSeconds`, and upsert the credential. Do not call rate limiting on provider callback; one-shot state is the replay control.

- [ ] **Step 7: Run focused tests, typecheck and build**

```bash
node --experimental-strip-types --test tests/melhor-envio-oauth-routes.test.ts tests/rate-limit.test.ts
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/admin/integrations/melhor-envio/page.tsx app/api/internal/melhor-envio/oauth/start/route.ts app/api/melhor-envio/oauth/callback/route.ts lib/server/rate-limit.ts tests/melhor-envio-oauth-routes.test.ts tests/rate-limit.test.ts
git commit -m "feat: add protected Melhor Envio authorization flow"
```

---

### Task 8: Move freight quotation onto the token manager with one auth retry

**Files:**
- Modify: `lib/server/melhor-envio.ts`
- Modify: `tests/melhor-envio.test.ts`

**Interfaces:**
- `quoteMelhorEnvio(...)` public signature remains unchanged.
- Internally it calls `getMelhorEnvioAccessToken()` before provider fetch.
- Only the Melhor Envio documented authentication failure triggers `getMelhorEnvioAccessToken({ forceRefresh: true, rejectedTokenVersion })` and one retry.

- [ ] **Step 1: Rewrite existing provider tests to use mocked token-manager credentials instead of `MELHOR_ENVIO_ACCESS_TOKEN`**

Retain existing payload/`custom_price`/`custom_delivery_time` assertions. Add: first attempt uses token version 7; provider 401/`Unauthenticated` causes forced refresh rejecting version 7; second attempt uses version 8 and succeeds.

- [ ] **Step 2: Add RED no-loop tests**

If both first and retried calls return auth failure, assert exactly two provider requests and exactly one forced refresh. A provider 422/500 must not force-refresh automatically. Error messages must not contain token/body values.

- [ ] **Step 3: Run provider tests and verify RED**

```bash
node --experimental-strip-types --test tests/melhor-envio.test.ts
```

- [ ] **Step 4: Refactor provider fetch into a one-attempt helper**

Conceptually:

```ts
async function requestQuoteWithToken(input: QuoteInput, accessToken: string): Promise<Response> { /* one HTTP request */ }
```

`quoteMelhorEnvio` obtains a `{accessToken, tokenVersion}`, sends once, identifies the documented auth condition, obtains a forced newer token, and sends once more. Parsing/normalization of successful quote entries remains unchanged.

- [ ] **Step 5: Remove all runtime reads of `MELHOR_ENVIO_ACCESS_TOKEN`**

Search the branch for the exact string. At this point it may remain only in migration/history docs being intentionally updated in Task 10; production code/tests must no longer depend on it.

- [ ] **Step 6: Run provider + shipping checkout tests**

```bash
node --experimental-strip-types --test tests/melhor-envio.test.ts tests/shipping-quote.test.ts tests/mixed-checkout-flow.test.ts tests/checkout-flow.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/server/melhor-envio.ts tests/melhor-envio.test.ts
git commit -m "feat: refresh Melhor Envio auth during quotes"
```

---

### Task 9: Add scheduled maintenance refresh

**Files:**
- Create: `app/api/internal/melhor-envio/refresh/route.ts`
- Create: `tests/melhor-envio-cron.test.ts`
- Create: `vercel.json`

**Interfaces:**
- `GET /api/internal/melhor-envio/refresh`
- Vercel sends `Authorization: Bearer $CRON_SECRET`.
- Schedule: once daily, `17 3 * * *` UTC.

- [ ] **Step 1: Write RED cron-auth tests**

Missing `CRON_SECRET`, missing header and wrong header all return `401` without invoking the token manager. Correct header invokes `getMelhorEnvioAccessToken()` once and returns only `{ ok: true }`. Manager/provider failures return a sanitized non-2xx response with no token data.

- [ ] **Step 2: Run cron tests and verify RED**

```bash
node --experimental-strip-types --test tests/melhor-envio-cron.test.ts
```

- [ ] **Step 3: Implement cron route using timing-safe server-secret validation**

Parse the `Bearer ` prefix, compare only the secret value with `timingSafeSecretEqual`, then invoke the same token manager. Do not add a separate refresh implementation.

- [ ] **Step 4: Register one daily Vercel Cron**

Create:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/internal/melhor-envio/refresh",
      "schedule": "17 3 * * *"
    }
  ]
}
```

The route is Production-only in scheduled operation because Vercel Cron runs against Production deployments; Sandbox/Preview exercises it manually during Task 3.1 verification.

- [ ] **Step 5: Run cron tests, typecheck and build**

```bash
node --experimental-strip-types --test tests/melhor-envio-cron.test.ts
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/internal/melhor-envio/refresh/route.ts tests/melhor-envio-cron.test.ts vercel.json
git commit -m "feat: schedule Melhor Envio token maintenance"
```

---

### Task 10: Finalize configuration docs and remove the legacy token contract

**Files:**
- Modify: `.env.example`
- Modify: `docs/shipping-setup.md`
- Modify: `docs/superpowers/specs/2026-08-29-melhor-envio-oauth-single-account-design.md` only to change status from planning to implemented after code verification, not before.

**Interfaces:**

Final Melhor Envio-related variable names:

```dotenv
MELHOR_ENVIO_ENVIRONMENT=
MELHOR_ENVIO_CLIENT_ID=
MELHOR_ENVIO_CLIENT_SECRET=
MELHOR_ENVIO_REDIRECT_URI=
MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY=
MELHOR_ENVIO_OAUTH_ADMIN_SECRET=
MELHOR_ENVIO_USER_AGENT=ProxyBembem (contato@proxybembem.com.br)
SHIPPING_ORIGIN_CEP=86730000
SHIPPING_QUOTE_SECRET=
CRON_SECRET=
```

`MELHOR_ENVIO_ACCESS_TOKEN` must be absent from final runtime docs/config.

- [ ] **Step 1: Add/adjust a config-document contract test if needed**

The existing env test plus an exact repository search must prove the legacy variable is absent from executable runtime code and `.env.example`.

- [ ] **Step 2: Update `.env.example`**

Keep names/placeholders only; never commit a real Client ID/Secret/token/key/admin/cron value.

- [ ] **Step 3: Update `docs/shipping-setup.md` with the operational sequence**

Document: create Sandbox app; exact callback; scope `shipping-calculate`; configure Preview Sandbox vars; open protected owner page; authorize once; verify quote; automatic refresh; reauthorization behavior; then later create Production app/variables in Task 3.2. Include `openssl rand -hex 32` as the local way to generate independent 256-bit encryption/admin/quote/cron secrets, with an explicit warning never to paste them into chat or commit them.

- [ ] **Step 4: Search for legacy token references**

Run:

```bash
git grep -n "MELHOR_ENVIO_ACCESS_TOKEN" -- ':!docs/superpowers/specs/2026-08-29-melhor-envio-oauth-single-account-design.md' ':!docs/superpowers/plans/2026-08-29-melhor-envio-oauth-single-account.md'
```

Expected: no runtime/config reference. Historical design/plan text may mention the removed name only to describe migration away from it.

- [ ] **Step 5: Run full local verification**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add .env.example docs/shipping-setup.md
git commit -m "docs: document Melhor Envio OAuth setup"
```

---

### Task 11: Apply migration and verify the complete Sandbox flow

**Files:**
- No new production code unless verification exposes a defect; any defect returns to RED → GREEN and gets its own focused commit.

**Consumes:** all previous tasks.

- [ ] **Step 1: Verify exact branch head and run fresh CI before touching external state**

Record the exact `feat/checkout-mercadopago` SHA. Ensure local `pnpm test`, `pnpm typecheck`, and `pnpm build` passed on that head.

- [ ] **Step 2: Apply `202608290002_melhor_envio_oauth.sql` through Supabase migration tooling**

Do not execute copied ad-hoc DDL. After application, query table RLS/grants and function ACLs. Expected: no `anon`/`authenticated` table access and no execute on privileged functions for `PUBLIC`, `anon`, or `authenticated`.

- [ ] **Step 3: Run Supabase security advisor**

Expected: no new WARN/ERROR attributable to the OAuth migration. Existing intentional backend-only `rls_enabled_no_policy` informational findings may remain if still applicable and verified.

- [ ] **Step 4: Configure Sandbox/Preview OAuth variables only**

Use a distinct Sandbox Melhor Envio application and stable Preview callback. Do not place Production credentials yet. Generate independent random values for token encryption/admin/quote/cron secrets. Never send the secret values in chat.

- [ ] **Step 5: Authorize the ProxyBembem Sandbox account once**

Open `/admin/integrations/melhor-envio` on the stable Preview, submit the owner bootstrap secret over HTTPS, authorize `shipping-calculate`, and return through `/api/melhor-envio/oauth/callback`.

- [ ] **Step 6: Verify ciphertext-only persistence**

Query only metadata needed to prove: environment `sandbox`, status `active`, positive token version, future access expiry, encrypted envelope formats beginning `v1.`. Do not print/decrypt token plaintext in verification output.

- [ ] **Step 7: Verify a live Sandbox freight quote**

Use the existing checkout UI or quote endpoint with a valid destination CEP. Expected: valid provider services and totals still flow through the existing trusted server-side shipping logic.

- [ ] **Step 8: Verify refresh behavior safely**

Exercise token-manager tests for near-expiry/concurrency/forced-refresh deterministically; for live Sandbox, perform only provider-supported refresh operations that do not risk losing the only usable authorization. Confirm rotated token version/expiry changes without logging plaintext.

- [ ] **Step 9: Verify owner-state replay and failure behavior**

A consumed callback state cannot be reused. Simulated invalid/revoked credential paths produce generic freight-unavailable behavior and never create Mercado Pago payment without a valid quote.

- [ ] **Step 10: Verify the cron route manually in Preview**

Call with missing/wrong auth → `401`; call with correct Preview `CRON_SECRET` → sanitized success and no token output. Production schedule itself remains inactive until a Production deployment later.

- [ ] **Step 11: Push final head and require exact-head CI + Vercel Preview success**

Wait for GitHub Actions and Vercel status on the exact same SHA. If either fails, Task 3.1 remains incomplete.

- [ ] **Step 12: Update spec status only after all gates pass**

Change the spec status to reflect implemented/Sandbox-verified state and commit that status-only documentation change.

- [ ] **Step 13: Declare Task 3.1 complete and start Task 3.2**

Only after fresh evidence for tests, typecheck, build, exact-head CI, Vercel Preview, live Sandbox OAuth+quote, and Supabase advisor. Then announce:

`Tarefa 3.1 — Melhor Envio OAuth seguro + renovação automática — CONCLUÍDA ✅`

and begin:

`Tarefa 3.2 — configuração consolidada das Environment Variables de Production — INICIADA.`

At Task 3.2, create the final Production variables in one pass, including the Production Melhor Envio OAuth app values plus Mercado Pago/Supabase/internal secrets required by the already-implemented code. Do not merge `main`.
