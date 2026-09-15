# ProxyBembem — Melhor Envio OAuth Single-Account Security Design

Date: 2026-08-29
Status: Approved in chat; awaiting written-spec review before implementation planning
Target branch: `feat/checkout-mercadopago`

## 1. Goal

Replace the current permanent `MELHOR_ENVIO_ACCESS_TOKEN` dependency with a production-ready OAuth 2.0 lifecycle for the single Melhor Envio account owned by ProxyBembem.

The integration must:

- serve only the ProxyBembem store and its own Melhor Envio account;
- never allow customers or third-party sellers to connect Melhor Envio accounts;
- request only `shipping-calculate` while the site only quotes freight;
- keep all credentials/tokens server-only;
- encrypt access and refresh tokens before persistence;
- refresh automatically, including during periods with little/no store traffic;
- coordinate refreshes so rotating refresh tokens cannot race;
- retry a provider request at most once after a successful forced refresh;
- require owner reauthorization when authorization is revoked/irrecoverable;
- isolate Sandbox from Production;
- preserve manual label purchase;
- stay on the feature branch until explicit merge approval.

## 2. Current state

Today `lib/server/melhor-envio.ts` reads `MELHOR_ENVIO_ACCESS_TOKEN` from `lib/server/env.ts` and sends it as the Bearer token for every quote.

That was acceptable for initial Sandbox validation, but the current Melhor Envio OAuth flow uses temporary access tokens and rotating refresh tokens. The application therefore needs lifecycle management rather than a static production token.

The existing trusted cart, server-side shipping metadata, quote revalidation, and manual-label business rules remain unchanged.

## 3. Confirmed deployment model

This is intentionally single-account:

- one ProxyBembem website;
- one seller/owner;
- one Melhor Envio account per environment;
- customers never authorize Melhor Envio;
- no marketplace/multi-tenant model.

Database records distinguish `sandbox` and `production`, not different merchants.

## 4. OAuth application and least privilege

The authorization request must use only trusted server configuration:

- configured Client ID;
- exact static callback URI;
- `response_type=code`;
- at least 256 bits of cryptographically random single-use `state`;
- scope exactly `shipping-calculate`.

Do not request cart, checkout, label generation, wallet, profile, tracking, or other scopes until a separately approved feature needs them.

The callback URI must never be built from arbitrary request `Host`/`Origin` headers. Production uses the canonical HTTPS ProxyBembem callback. Sandbox/Preview uses an explicitly configured stable HTTPS callback.

## 5. Owner-only authorization

Only the owner may start or restart OAuth.

### 5.1 Bootstrap page

Provide a narrow internal page such as `/admin/integrations/melhor-envio`. It must not expose tokens, Client Secret, encryption state, or provider account data.

The page submits a high-entropy owner bootstrap secret in a POST body over HTTPS. The secret:

- exists only in a server-side environment variable;
- is never put in a URL;
- is never logged or persisted by application code;
- is compared with a timing-safe comparison;
- is protected by server-side rate limiting;
- requires an allowed same-origin `Origin` header before starting OAuth.

Invalid authorization attempts return a generic unauthorized response.

A successful POST creates a one-time OAuth state and returns an HTTP redirect to Melhor Envio. This is intentionally smaller than introducing a full admin authentication system solely for this integration.

### 5.2 OAuth state

Store only SHA-256(state), never the raw state. State metadata contains:

- hash;
- environment;
- creation time;
- expiration time;
- consumed-at marker.

State expires after 10 minutes and is atomically single-use. Missing, malformed, expired, wrong-environment, or replayed state fails before provider credentials are persisted.

State is consumed before token acceptance. If the subsequent provider exchange fails, the owner starts a fresh authorization rather than replaying the callback.

## 6. Token exchange

The callback performs the authorization-code exchange server-to-server using the configured Client ID, Client Secret, exact redirect URI and required User-Agent.

Validate the response before persistence. Require at minimum:

- expected Bearer token type;
- non-empty access token;
- non-empty refresh token;
- sane positive `expires_in`.

Provider response bodies are untrusted and may contain credentials. Never copy raw token/error responses into browser output or ordinary logs.

## 7. Authenticated encryption at rest

Persist no provider token in plaintext.

Use AES-256-GCM with:

- an independent 256-bit key stored only in previous hosting provider server environment;
- a fresh random nonce/IV for every encryption;
- authentication-tag verification;
- a versioned envelope format;
- authenticated additional data (AAD) binding the ciphertext to both the environment (`sandbox`/`production`) and token kind (`access`/`refresh`).

The AAD binding prevents an encrypted token from being silently swapped between environments or between access/refresh fields.

The encryption key never enters Supabase. Database-only compromise therefore does not reveal usable provider tokens. Any malformed envelope, unknown version, wrong AAD, or authentication-tag failure fails closed; there is no fallback to an environment access token.

Crypto lives in a small server-only module with focused tests.

## 8. Database model and permissions

Use dedicated Melhor Envio tables rather than a generic multi-provider framework.

### 8.1 Credential table

One row per environment, conceptually containing:

- environment primary key;
- encrypted access-token envelope;
- encrypted refresh-token envelope;
- access-token expiry;
- token issued/updated timestamp;
- token version/revision;
- status: `active` or `reauthorization_required`;
- refresh lease owner, nullable;
- refresh lease expiry, nullable;
- last sanitized authentication-failure timestamp/classification, nullable.

Client Secret, encryption key, owner bootstrap secret and cron secret are never persisted here.

### 8.2 OAuth state table

Contains only hashed one-time state metadata. Expired/consumed rows can be cleaned opportunistically.

### 8.3 Access policy

Both tables have RLS enabled and no browser-facing policies. `anon` and `authenticated` receive no direct access.

Atomic state-consume and refresh-lease/version transitions use narrowly scoped PostgreSQL RPCs where appropriate. Any `SECURITY DEFINER` function must use a fixed safe `search_path`, and `EXECUTE` must be revoked from `PUBLIC`, `anon`, and `authenticated`; only the trusted server role may invoke it.

## 9. Token manager

All Melhor Envio HTTP operations obtain credentials through one server-only token manager. Freight code must not read token rows directly.

Normal request flow:

1. load the exact configured environment row;
2. reject `reauthorization_required`;
3. decrypt the access token with environment/token-kind AAD;
4. if comfortably valid, return it;
5. if near expiry, enter coordinated refresh;
6. return only a current committed token.

There is never a Sandbox↔Production fallback.

Use a conservative proactive refresh threshold. Implementation should refresh well before the 30-day access-token deadline (recommended: when no more than 7 days remain), while still accepting a valid token during normal coordinated refresh where safe.

## 10. Refresh rotation and concurrency

Rotating refresh tokens make concurrent serverless refreshes dangerous. Use a short database-backed lease plus token-version compare-and-set semantics.

### 10.1 Lease winner

A caller may claim refresh only when the lease is absent/expired and the observed token version is still current. The winner gets a unique lease-owner ID.

The winner:

1. decrypts the current refresh token;
2. calls the provider refresh grant;
3. validates the new response;
4. encrypts both new tokens with new nonces and correct AAD;
5. atomically commits only if lease owner and expected token version still match;
6. increments token version;
7. updates access expiry;
8. clears the lease.

A stale winner can never overwrite a newer version.

### 10.2 Lease loser — proactive refresh

A caller that loses a normal proactive-refresh race must not call the provider with the same refresh token. If its current access token remains valid for the immediate request, it may use it; otherwise it waits/reloads for the winner for a short bounded period, then fails closed if no valid committed token appears.

### 10.3 Lease loser — forced refresh after authentication failure

This is stricter. If the access token has already produced an authentication failure, a losing caller must **never reuse that known-failed token**, even if its local expiry timestamp says it is valid. It waits for a newer committed token version from the refresh winner or fails closed after a short bounded timeout.

### 10.4 Crash recovery

Refresh leases expire quickly. If a serverless invocation dies while holding the lease, another invocation can recover after lease expiry. There is no permanent lock.

## 11. Provider authentication failure

On the provider's documented unauthenticated condition:

1. do not retry the same token repeatedly;
2. force coordinated refresh using the same lease/version protections;
3. retry the original Melhor Envio request exactly once with a newer token;
4. if the second provider attempt is still unauthenticated, stop and fail closed rather than loop.

Non-authentication 4xx responses do not automatically refresh credentials.

If refresh is rejected in a way that indicates the refresh authorization is unusable/revoked, atomically mark `reauthorization_required`. While in that state freight quotation fails safely and checkout cannot create a payment without a valid freight quote.

The customer sees only a generic temporary freight-unavailable message. The owner reconnects using the protected OAuth bootstrap flow.

## 12. Scheduled maintenance refresh

Request-driven refresh alone is insufficient for a low-traffic store: a refresh token can age out while no customer is requesting quotes.

Production therefore includes a server-side scheduled health/refresh check, preferably previous hosting provider Cron, in addition to request-driven refresh.

A route such as `/api/internal/melhor-envio/refresh`:

- accepts only previous hosting provider's configured cron Bearer secret;
- compares authorization safely;
- returns no token/provider secrets;
- calls the same token manager/lease mechanism, never a separate refresh implementation;
- refreshes only when the proactive threshold says it is needed;
- is safe if invoked more than once because lease/version rules remain authoritative.

The scheduled job may run daily; it does not need to refresh daily. It only ensures the token manager gets a chance to refresh before the current token lifecycle becomes stale, even with no storefront traffic.

Preview/Sandbox can test this route manually with test configuration; Production scheduling is enabled only after Production variables are ready.

## 13. Final Melhor Envio environment variables

After migration, the Melhor Envio-related server configuration is:

- `MELHOR_ENVIO_ENVIRONMENT` — `sandbox` or `production`;
- `MELHOR_ENVIO_CLIENT_ID` — OAuth application ID;
- `MELHOR_ENVIO_CLIENT_SECRET` — server-only OAuth Client Secret;
- `MELHOR_ENVIO_REDIRECT_URI` — exact static callback URI;
- `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` — independent 256-bit encryption key;
- `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` — independent high-entropy owner bootstrap secret;
- `MELHOR_ENVIO_USER_AGENT` — required application/contact User-Agent;
- `SHIPPING_ORIGIN_CEP` — trusted origin CEP;
- `SHIPPING_QUOTE_SECRET` — existing independent quote-signing secret;
- `CRON_SECRET` — independent high-entropy secret protecting scheduled internal maintenance.

`MELHOR_ENVIO_ACCESS_TOKEN` is removed from permanent runtime configuration after OAuth Sandbox verification. No secret may use a `NEXT_PUBLIC_` prefix.

Sandbox and Production use isolated OAuth credentials/tokens and independent encryption/admin/cron secrets where environment separation applies. Production values are never filled with Sandbox credentials/placeholders.

## 14. Server component boundaries

Keep responsibilities separated:

- **OAuth env/config:** validates environment, Client ID/Secret, redirect URL, key material, User-Agent, admin and cron secrets.
- **Token crypto:** AES-256-GCM envelope/AAD only; no HTTP or database logic.
- **OAuth repository:** credential rows, state rows and atomic RPC contracts.
- **OAuth client:** builds authorize URL and performs authorization-code/refresh exchanges.
- **Token manager:** selects current token, coordinates leases, refreshes and handles reauthorization state.
- **Freight client:** calculates shipping but asks token manager for Bearer credentials.
- **Owner bootstrap/callback:** starts/finishes the one-account OAuth flow without exposing tokens.
- **Scheduled refresh route:** invokes the same token manager using cron authentication.

## 15. Callback rules

Use a fixed route, conceptually `/api/melhor-envio/oauth/callback`, with its full URL supplied by `MELHOR_ENVIO_REDIRECT_URI`.

The callback:

- validates strict `code`/`state` length and shape;
- handles provider denial/error callbacks generically;
- consumes valid state atomically;
- performs server-to-server exchange;
- stores only encrypted tokens;
- clears stale refresh leases and safely updates token version/status;
- redirects to a non-sensitive owner success/failure page;
- never puts tokens, authorization code, raw state, Client Secret or raw provider errors into redirects/logs.

## 16. Failure behavior and logging

Allowed operational logging is limited to non-secret metadata such as environment, operation name, provider HTTP status, sanitized error class, token version and lease outcome.

Never log access token, refresh token, authorization code, OAuth raw state, Client Secret, encryption key, owner bootstrap secret, cron secret, or full provider token/error response bodies.

Decryption failures, missing credentials, lease timeouts and provider-auth failures all fail closed. They never bypass freight validation or permit Mercado Pago payment creation without a valid quote.

## 17. Migration and rollout

### Phase A — branch implementation

Implement tests, migration, crypto/repository/token-manager/OAuth routes, cron route and adapt the freight client on `feat/checkout-mercadopago`. `main` remains untouched.

### Phase B — Sandbox OAuth

Configure Sandbox OAuth values, apply migration, authorize the single ProxyBembem Sandbox account, and verify ciphertext-only token persistence.

The legacy Sandbox access token may remain configured temporarily during development but must not be a runtime fallback. Remove its code dependency once OAuth Sandbox passes.

### Phase C — Sandbox verification

Verify initial authorization, quote, encrypted persistence, proactive/forced refresh, refresh-token rotation, concurrent refresh, known-failed-token handling, state replay/expiry, reauthorization behavior, cron-auth behavior and no secret leakage.

### Phase D — consolidated Production configuration

Only after Task 3.1 Sandbox verification do we create/finalize the complete Production previous hosting provider variable set in one pass, authorize the Production Melhor Envio account, then continue Mercado Pago Production/webhook and final Production validation.

## 18. Testing requirements

Implementation follows TDD for critical behavior. At minimum cover:

- env validation, HTTPS/static Production redirect, exact 256-bit encryption key and strong admin/cron secrets;
- AES-GCM round-trip, fresh nonce, AAD mismatch, ciphertext/tag modification and unknown envelope version;
- exact `shipping-calculate` scope;
- allowed-origin admin POST, rate limit and timing-safe secret check;
- random state, hashed-at-rest state, expiry and single-use replay protection;
- token-response validation and encrypted-only persistence;
- valid token skips refresh;
- proactive threshold triggers refresh;
- one winner for concurrent refresh;
- proactive loser may use only a still-valid token;
- forced-refresh loser never reuses the known-failed token;
- stale refresh result cannot overwrite a newer version;
- lease expiry recovers from a crashed winner;
- refresh response atomically rotates both tokens;
- provider auth failure allows at most one refreshed retry;
- non-auth 4xx does not refresh;
- irrecoverable refresh marks reauthorization required;
- scheduled route rejects missing/wrong cron authorization and returns no secrets;
- Sandbox/Production database rows cannot cross environments;
- freight obtains credentials only through token manager;
- missing valid OAuth state/credential prevents payment creation rather than bypassing shipping;
- RLS enabled and no `anon`/`authenticated` access;
- privileged RPC `EXECUTE` denied to `PUBLIC`, `anon`, `authenticated`;
- Supabase security advisor reviewed after migration.

Before Task 3.1 is declared complete, gather fresh evidence from unit/integration tests, TypeScript typecheck, production build, exact-head GitHub Actions CI, preview environment, live Sandbox OAuth + freight quote, and Supabase security advisor.

## 19. Non-goals

Task 3.1 does not add customer accounts, merchant accounts, multi-tenant Melhor Envio connections, automatic label purchase, wallet operations, tracking automation, a general admin-auth platform, Production deployment, or merge to `main`.

## 20. Completion gate

Task 3.1 is complete only when:

1. OAuth is implemented on the feature branch;
2. persisted tokens are authenticated-encrypted and inaccessible to browser roles;
3. refresh rotation is automatic, scheduled and concurrency-safe;
4. a token already rejected by the provider is never reused during forced-refresh races;
5. owner authorization/re-authorization is protected and state-replay safe;
6. only `shipping-calculate` is requested;
7. Sandbox end-to-end authorization and quote succeed with no legacy runtime fallback;
8. tests, advisor, typecheck, build, exact-head CI and Preview verification are clean/understood;
9. no secret is committed, logged, exposed to the client or copied into support screenshots.

Production credentials are configured afterward in the consolidated Production-variables task. No merge to `main` occurs without explicit owner approval.
