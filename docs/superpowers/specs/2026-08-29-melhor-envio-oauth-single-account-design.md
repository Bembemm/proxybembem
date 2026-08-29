# ProxyBembem — Melhor Envio OAuth Single-Account Security Design

Date: 2026-08-29
Status: Approved in chat; awaiting written-spec review before implementation planning
Target branch: `feat/checkout-mercadopago`

## 1. Goal

Replace the current long-lived/static `MELHOR_ENVIO_ACCESS_TOKEN` dependency with a production-ready OAuth 2.0 flow for the single Melhor Envio account owned by ProxyBembem.

The finished integration must:

- serve only the ProxyBembem store and its own Melhor Envio account;
- never allow customers or third-party sellers to connect Melhor Envio accounts;
- request only the permission currently needed for the site: `shipping-calculate`;
- keep Client Secret, access tokens, refresh tokens, encryption keys, and administrator bootstrap credentials server-only;
- encrypt provider tokens before they are persisted in Supabase;
- refresh tokens automatically without seller intervention during normal operation;
- prevent concurrent refresh attempts from racing and invalidating a newly rotated refresh token;
- retry a failed provider request at most once after a successful forced refresh when Melhor Envio reports an authentication failure;
- require explicit owner reauthorization when the provider has revoked/invalidated the authorization or the refresh token can no longer be used;
- isolate Sandbox credentials/tokens from Production credentials/tokens;
- preserve the existing quote-only/manual-label fulfillment scope;
- remain on the feature branch until the final production-readiness gate and explicit merge approval.

## 2. Current state and reason for change

The current provider client reads `MELHOR_ENVIO_ACCESS_TOKEN` from the server environment and sends it directly as the Bearer token on every freight quotation.

That was sufficient for the initial Sandbox checkout validation, but it is not the desired production design. Melhor Envio's current OAuth 2.0 documentation specifies a 30-day access-token lifetime and a refresh flow that returns a new access token and a new refresh token. The integration therefore needs token lifecycle management rather than a permanently configured access-token variable.

The current quote endpoint and trusted server-side product/freight calculations remain valid. This design changes authentication and token lifecycle, not the business rules for freight pricing.

## 3. Confirmed deployment model

ProxyBembem is a single-store integration:

- one website;
- one seller/owner;
- one Melhor Envio account;
- customers never authorize Melhor Envio;
- no marketplace or multi-tenant account model.

The database model may distinguish Sandbox and Production, but it does not model multiple merchants/users.

## 4. OAuth application and least privilege

Create/configure a Melhor Envio application separately for the environment being used.

The OAuth authorization request must use:

- the configured Client ID;
- an exact, statically configured callback URI;
- `response_type=code`;
- a cryptographically random, single-use `state` value;
- only the `shipping-calculate` scope.

Do not request cart, purchase, label-generation, wallet, user-profile, tracking, or other scopes while the site only calculates freight and labels remain a manual seller operation.

The callback URI must come from trusted server configuration. It must never be derived from an arbitrary request `Host` or `Origin` header.

Production callback must use the canonical HTTPS ProxyBembem domain. Sandbox/Preview must use its own explicitly configured stable HTTPS callback URL.

## 5. Owner-only authorization and reauthorization

Because only the store owner may connect the Melhor Envio account, authorization initiation must not be a public unauthenticated action.

### 5.1 Minimal owner authorization page

Provide a small internal page such as:

- `/admin/integrations/melhor-envio`

The page itself must not expose credentials or token state. It exists only to submit an owner bootstrap secret to the server over HTTPS.

The owner secret:

- lives only in a server-side environment variable;
- is a high-entropy random value;
- is never placed in a URL/query string;
- is never logged;
- is never stored in the browser by application code;
- is compared server-side using a timing-safe comparison;
- is protected by the project's server-side rate limiting.

A successful owner POST creates a one-time OAuth state and redirects the browser to Melhor Envio. An invalid secret returns a generic unauthorized response without disclosing configuration details.

This narrowly scoped bootstrap mechanism is preferred over introducing a complete admin-login subsystem solely for one provider authorization flow.

### 5.2 OAuth state

Generate at least 256 bits of cryptographically secure random state.

Persist only a SHA-256 hash of the state, together with:

- environment;
- creation time;
- expiration time;
- consumed/used state.

Recommended state lifetime: 10 minutes.

The callback hashes the returned state and atomically consumes a matching unused, unexpired record. Missing, invalid, expired, or previously used state must fail before any token is stored.

Consuming state is intentionally one-shot. If the subsequent provider token exchange fails, the owner starts authorization again instead of replaying the callback.

## 6. Token exchange and provider validation

The callback performs the authorization-code exchange server-to-server using the configured:

- Client ID;
- Client Secret;
- exact redirect URI;
- authorization code;
- required User-Agent.

The application must validate the token response shape before storing anything. At minimum it must require a non-empty Bearer access token, non-empty refresh token, and a sane positive access-token lifetime.

Provider error bodies must not be copied directly into browser responses or normal logs. Store/report only a sanitized provider error classification/status when needed for operations.

## 7. Token encryption at rest

Access and refresh tokens must not be stored as plaintext database columns.

Use application-layer authenticated encryption with AES-256-GCM:

- one independent 256-bit encryption key supplied as a server-only environment secret;
- a fresh random nonce/IV for every encryption operation;
- authentication tag verification on decryption;
- an explicit ciphertext format/version so future key/format migration remains possible.

The database stores only encrypted token envelopes. The encryption key never enters Supabase and is never included in API responses or logs.

This provides defense in depth: database-only access does not reveal usable Melhor Envio tokens.

Encryption/decryption must be isolated in a small server-only module with focused tests. Decryption/authentication failure must fail closed and mark the integration unavailable rather than falling back to another credential source.

## 8. Database model

Use dedicated single-purpose Melhor Envio OAuth tables rather than a premature generic multi-provider credential framework.

### 8.1 Credential table

Conceptually store one row per environment (`sandbox`, `production`) with fields for:

- environment primary key;
- encrypted access-token envelope;
- encrypted refresh-token envelope;
- access-token expiration timestamp;
- authorization/token update timestamp;
- token version/revision;
- integration status (`active` or `reauthorization_required`);
- refresh lease owner, nullable;
- refresh lease expiration, nullable;
- last sanitized authentication failure timestamp/classification, nullable.

Do not persist Client Secret or the token-encryption key in this table.

### 8.2 OAuth-state table

Store only one-time authorization state metadata:

- state hash;
- environment;
- created-at;
- expires-at;
- consumed-at/used marker.

Expired rows can be cleaned periodically or opportunistically.

### 8.3 Database access policy

Both tables must:

- have RLS enabled;
- expose no direct `anon` or `authenticated` policy;
- grant application access only through the existing trusted server-side Supabase credential and narrowly scoped RPCs where atomicity is required.

Security-definer RPCs, if used, must have a fixed safe `search_path` and have `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated` unless a specific role requires it.

## 9. Access-token selection and proactive refresh

Every Melhor Envio API call obtains a token through one server-side token manager. Provider callers must not read OAuth token database fields directly.

Normal flow:

1. load the credential row for the configured environment;
2. reject if status is `reauthorization_required`;
3. decrypt the current access token;
4. if it remains valid beyond a conservative refresh buffer, return it;
5. if it is near expiry, enter the refresh-coordination flow;
6. after refresh, return the newly committed access token.

Use a conservative refresh buffer so normal traffic refreshes before the 30-day deadline. The exact buffer belongs in implementation configuration/test constants, not browser configuration. A value on the order of hours rather than seconds is preferred.

The system must never silently fall back from Production to Sandbox or vice versa.

## 10. Refresh-token rotation and concurrency control

Refresh tokens rotate. Concurrent serverless requests must not independently refresh the same token and race to store incompatible results.

Use a short database-backed refresh lease.

### 10.1 Lease acquisition

A request that decides refresh is needed generates a unique lease-owner identifier and atomically claims the refresh lease only if:

- no active lease exists, or the previous lease expired; and
- the credential row/token version is still the version the requester observed.

Only one request becomes the refresh winner.

### 10.2 Winner behavior

The winner:

1. decrypts the current refresh token;
2. calls Melhor Envio's refresh-token grant server-to-server;
3. validates the response;
4. encrypts both newly returned tokens with fresh nonces;
5. atomically commits the new token pair only if it still owns the lease and the expected token version matches;
6. increments the token version;
7. updates access-token expiry;
8. clears the lease and returns the new access token.

Never overwrite a newer token version with an older refresh result.

### 10.3 Loser behavior

A request that cannot acquire the lease must not call the refresh endpoint with the same refresh token.

If the currently loaded access token is still safely valid, it may use that token. Otherwise it briefly waits/reloads the credential row for the winner's committed version, subject to a strict short timeout. If no valid token becomes available, freight quotation fails closed with a temporary provider-unavailable response.

### 10.4 Crashed refresh owner

Leases have a short expiration. If the winning serverless invocation crashes, another request can recover after the lease expires. No permanent lock is possible.

## 11. Authentication failure and one retry

If a Melhor Envio API request returns the provider's authentication-failure condition while the locally stored token appeared valid:

1. do not repeatedly retry the same token;
2. enter a forced coordinated refresh using the same lease/version protections;
3. if refresh succeeds, retry the original Melhor Envio request exactly once with the new token;
4. if the retried request is still unauthenticated, fail closed and require reauthorization rather than looping.

Provider 4xx errors unrelated to authentication must not trigger token refresh automatically.

## 12. Reauthorization-required state

If the refresh grant is rejected in a way that indicates the authorization/refresh token is no longer usable, mark the environment as `reauthorization_required`.

While in this state:

- freight quotation must not use stale credentials;
- checkout must not create a Mercado Pago payment without a valid freight quote;
- customers receive a generic temporary freight-unavailable/retry-later message;
- no provider token or internal authorization detail is exposed;
- the owner reconnects through the protected owner authorization flow.

Successful authorization replaces the encrypted token pair, increments/reinitializes the revision safely, clears stale refresh leases, and returns the integration to `active`.

## 13. Environment variables after this redesign

The Melhor Envio portion of the final server environment becomes conceptually:

- `MELHOR_ENVIO_ENVIRONMENT` — `sandbox` or `production`;
- `MELHOR_ENVIO_CLIENT_ID` — application identifier for that Vercel environment;
- `MELHOR_ENVIO_CLIENT_SECRET` — server-only OAuth client secret;
- `MELHOR_ENVIO_REDIRECT_URI` — exact static callback URI for that environment;
- `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` — independent 256-bit application encryption key;
- `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` — independent high-entropy owner bootstrap secret;
- `MELHOR_ENVIO_USER_AGENT` — required provider User-Agent with application/contact identification;
- `SHIPPING_ORIGIN_CEP` — trusted origin CEP;
- `SHIPPING_QUOTE_SECRET` — existing independent HMAC secret for signed freight quotes.

`MELHOR_ENVIO_ACCESS_TOKEN` is removed from the permanent environment configuration after migration to the OAuth token manager.

No secret may use a `NEXT_PUBLIC_` prefix.

Sandbox and Production must use distinct client credentials, authorization records/tokens, admin bootstrap secrets, and encryption keys where Vercel environment separation allows it. Production values must never be copied from Sandbox merely to fill a required field.

## 14. Server components

Keep responsibilities separated:

### OAuth configuration/env module

Validates environment, URLs, key material, Client ID/Secret, User-Agent, and owner bootstrap secret.

### Token crypto module

Encrypts/decrypts versioned AES-256-GCM token envelopes. Contains no provider HTTP logic and no database logic.

### OAuth repository module

Reads/writes credential state, manages one-time OAuth states, and invokes atomic lease/state RPCs. Contains no browser/UI code.

### Melhor Envio OAuth client

Builds authorization URLs and performs authorization-code/refresh token exchanges. Contains no freight business logic.

### Token manager

Returns a usable access token, coordinates refresh leases, handles reauthorization state, and exposes a single provider-authentication interface to the freight client.

### Freight client

Keeps the existing shipment-calculation responsibilities, but obtains a token from the token manager instead of reading `MELHOR_ENVIO_ACCESS_TOKEN` directly.

### Owner bootstrap routes/page

Provide the narrowly scoped owner authorization start and callback flow. They must never expose stored tokens.

## 15. Callback and URL rules

Use one fixed callback route, conceptually:

- `/api/melhor-envio/oauth/callback`

The exact full callback URL comes only from `MELHOR_ENVIO_REDIRECT_URI`.

The callback must:

- require `code` and `state` within strict length limits;
- reject provider error callbacks safely;
- atomically consume valid state before accepting credentials;
- perform server-to-server token exchange;
- store only encrypted tokens;
- redirect the owner to a non-sensitive success/failure page;
- never include provider tokens, codes, Client Secret, or raw provider error bodies in its redirect URL.

Authorization-code and state query values are treated as secrets/transient credentials and must not be logged by application code.

## 16. Failure behavior and observability

Operational logs may include:

- environment;
- high-level operation (`authorize`, `refresh`, `quote`);
- provider HTTP status where useful;
- sanitized internal error classification;
- token version/lease outcome if it contains no secret material.

Logs must never include:

- access token;
- refresh token;
- authorization code;
- OAuth state value;
- Client Secret;
- encryption key;
- owner bootstrap secret;
- full provider response bodies that may contain credentials.

Customer-facing responses remain generic and do not reveal whether a credential expired, was revoked, or failed decryption.

## 17. Migration and rollout

### Phase 1 — implement on feature branch

Add tests, database migrations, token crypto/repository/manager, OAuth routes, and adapt the freight client. Do not modify `main`.

### Phase 2 — Sandbox authorization

Configure Sandbox OAuth application variables, apply the database migration, authorize the single ProxyBembem Melhor Envio Sandbox account through the owner flow, and verify that encrypted credentials are persisted.

The old Sandbox `MELHOR_ENVIO_ACCESS_TOKEN` remains available only during development until the new path passes verification; it must not be used as a silent runtime fallback. Remove the legacy dependency after the OAuth path is verified.

### Phase 3 — Sandbox verification

Verify:

- initial authorization;
- normal freight quotation;
- access-token retrieval from encrypted persistence;
- proactive refresh;
- refresh-token rotation;
- concurrent refresh requests produce one provider refresh;
- forced refresh after authentication failure;
- one-retry maximum;
- reauthorization-required behavior;
- state expiry/replay rejection;
- quote/checkout still use server-authoritative freight amounts;
- no credential appears in responses/logs/browser bundles.

### Phase 4 — Production variables and authorization

Only after Sandbox verification, configure the final Production variables in Vercel in one pass, create/configure the Production Melhor Envio application, and authorize the production account once.

This is followed by the remaining Mercado Pago Production/webhook and complete Production validation tasks before any merge to `main`.

## 18. Testing requirements

Implementation follows TDD for the critical behavior.

At minimum test:

### Environment/security

- missing/invalid OAuth variables fail closed;
- redirect URI must be HTTPS in Production and exact/static;
- encryption key must decode to exactly 256 bits;
- admin secret minimum entropy/length requirement;
- no client-side import can obtain server secret modules.

### Crypto

- encrypt/decrypt round trip;
- fresh nonce results in different ciphertext for the same plaintext;
- modified ciphertext/tag fails authentication;
- malformed/version-unknown envelope fails closed.

### Authorization

- authorization URL uses configured host/client/redirect;
- scope is exactly the approved minimum scope;
- state is random, hashed at rest, expiring, and single-use;
- invalid admin secret cannot create authorization state;
- wrong/expired/replayed state is rejected;
- malformed/missing code rejected;
- token response validation rejects missing/invalid fields;
- persisted tokens are encrypted, never plaintext.

### Refresh concurrency

- valid non-expiring token skips refresh;
- near-expiry token triggers refresh;
- exactly one concurrent caller acquires a refresh lease;
- loser does not reuse the same refresh token at the provider;
- stale winner cannot overwrite a newer token version;
- expired lease can be recovered;
- new refresh token replaces the previous token atomically;
- failed/invalid refresh marks reauthorization when appropriate.

### Freight integration

- quote client obtains Bearer token through token manager;
- one authentication failure can trigger one coordinated refresh and one retry;
- second authentication failure does not loop;
- non-auth provider errors do not trigger refresh;
- Sandbox/Production records cannot cross environments;
- missing valid OAuth credentials prevents payment creation rather than bypassing freight validation.

### Database/security

- RLS enabled on OAuth tables;
- no `anon`/`authenticated` direct access;
- new security-definer functions use fixed safe `search_path`;
- `PUBLIC`, `anon`, and `authenticated` cannot execute privileged OAuth RPCs;
- Supabase security advisor is reviewed after migrations.

### Project verification

Before claiming Task 3.1 implementation complete, run fresh evidence for:

- unit/integration tests;
- TypeScript typecheck;
- production build;
- exact-head GitHub Actions CI;
- Vercel Preview deployment;
- live Sandbox OAuth authorization and freight quote;
- Supabase security advisor.

## 19. Explicit non-goals

This task does not add:

- customer accounts;
- seller/merchant accounts;
- multi-tenant Melhor Envio connections;
- automatic label purchase;
- Melhor Envio wallet operations;
- automatic tracking;
- a general-purpose admin authentication platform;
- automatic Production deployment or merge to `main`.

Those require separate design/approval if ever needed.

## 20. Completion gate

Task 3.1 is complete only when:

1. the OAuth design is implemented on the feature branch;
2. credentials are encrypted at rest and inaccessible to browser roles;
3. refresh rotation is automatic and concurrency-safe;
4. owner authorization/re-authorization is protected and state-replay safe;
5. only `shipping-calculate` is requested;
6. Sandbox end-to-end authorization and quote succeed without legacy access-token fallback;
7. security tests, Supabase advisor, CI, build, typecheck, and Preview are clean/understood;
8. no secret is committed or exposed.

Production credentials are configured afterward as part of the consolidated Production configuration task. No merge to `main` occurs without explicit owner approval.
