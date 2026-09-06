# Durable password recovery grant design

Date: 2026-09-05
Branch: `feat/admin-dashboard-expansion`

## Goal

Make password recovery scanner-safe, retry-safe across KingHost/Node/Nginx failures, and resistant to token replay without depending on a browser-bound Supabase recovery session.

Production acceptance exposed a concrete failure in the prior TokenHash design: the first final-submit request can consume the Supabase recovery token and then lose the response because the application process/upstream fails. The next submit then receives `401`, even though the password was never changed.

## Chosen architecture

The application owns a short-lived recovery grant backed by a cryptographically random bearer token and a server-only HMAC record. Supabase remains the identity authority and password store.

### 1. Issuance

`POST /api/account/password-reset` keeps the existing same-origin check, body bound, anti-enumeration response and rate limit.

For an existing account, the server:

1. calls `auth.admin.generateLink({ type: "recovery", email })` only to obtain the server-authenticated target user id without sending Supabase's consumable `/verify` URL;
2. creates a fresh 256-bit application recovery token with Node `randomBytes(32)` and Base64URL encoding;
3. derives `grant_key = HMAC-SHA256(RATE_LIMIT_SECRET, domain || token)` with domain separation; the raw token is never stored in the database;
4. persists a server-only grant for that user, revoking older outstanding grants for the same user;
5. sends `https://www.proxybembem.com.br/auth/confirm?token_hash=<opaque-token>&type=recovery` through Resend.

The email does not contain a Supabase `/auth/v1/verify` URL, so scanners cannot consume a provider OTP.

### 2. Grant storage

A new `public.password_recovery_grants` table stores only:

- the 64-character lowercase hexadecimal HMAC `grant_key`;
- `user_id`;
- timestamps for creation/expiry;
- a short claim lease (`lease_id`, `lease_expires_at`);
- `consumed_at` / `revoked_at`.

No email, raw recovery token, password, access token or refresh token is stored.

RLS is enabled. Direct access is revoked from `public`, `anon`, `authenticated` and `service_role`. Three `SECURITY DEFINER` RPCs with empty `search_path` are executable only by `service_role`:

- `issue_password_recovery_grant`;
- `claim_password_recovery_grant`;
- `finish_password_recovery_grant`.

A new request revokes older unconsumed grants for that user. Grants are valid for at most 3600 seconds before first use. A successful claim shortens the remaining grant lifetime to at most 300 seconds and leases it for 45 seconds, preventing concurrent password changes while allowing retry after a process/gateway failure.

### 3. Link landing

`GET /auth/confirm` remains a non-consuming scanner-safe GET. It validates the application token shape, stores it in the existing host-only `HttpOnly`, `SameSite=Lax`, `Secure`-in-production recovery cookie, and redirects to clean `/redefinir-senha` with `private, no-store`.

### 4. Final password submit

`POST /api/account/password-recovery` keeps same-origin, body limits, password validation and rate limiting.

It no longer calls `verifyOtp()` and no longer depends on a recovery session created in the same HTTP response.

Instead:

1. read and validate the recovery cookie;
2. derive its HMAC grant key server-side;
3. atomically claim the grant through the service-role RPC;
4. if the grant is already actively leased, return a retryable response instead of consuming/rejecting it;
5. update the exact target user with server-only `auth.admin.updateUserById(user_id, { password })`;
6. on provider failure, release the lease so the same valid link can be retried;
7. on success, mark the grant consumed and clear the recovery cookie.

The current Supabase Auth implementation revokes existing user sessions when an admin password update is performed without a session id, which preserves the intended security property of password recovery.

### 5. Crash and retry semantics

The critical credential is not consumed before password storage.

- Crash before grant claim: retry normally.
- Crash after claim but before password update: the 45-second lease expires, then retry can continue.
- Password provider error: lease is explicitly released for immediate retry.
- Password update succeeds but final grant consumption cannot be persisted: the grant remains leased temporarily and, after the first claim, has no more than a 5-minute residual lifetime. This is the unavoidable cross-system failure window between Auth and Postgres; it is bounded and requires possession of the original high-entropy HttpOnly/email bearer token.
- Successful completion marks the grant consumed and clears the cookie.

## Security constraints

- 256-bit random application recovery tokens.
- Database stores only HMACs, never bearer tokens.
- HMAC uses existing strong server-only `RATE_LIMIT_SECRET` with explicit domain separation; no extra production secret is introduced.
- Exactly one newest outstanding grant per user; older grants are revoked on issuance.
- Direct grant table access is denied; only service-role RPCs can mutate/read grant state.
- RLS enabled as defense in depth.
- Fixed same-origin routes; no caller-controlled redirect.
- Host-only HttpOnly recovery cookie, `SameSite=Lax`, `Path=/`, `Secure` in production.
- Recovery API responses are `private, no-store`.
- No token, grant key, user email, password, Resend key, access token, refresh token or cookie value is logged.
- `auth.admin.updateUserById` is server-only and uses the existing secret Supabase credential.

## Failure responses

- Missing/malformed/expired/revoked/consumed grant: `401` with the existing safe recovery message and cookie clearing.
- Grant currently leased by another in-flight attempt: retryable `409` with a short wait message; do not clear the cookie.
- Invalid password/provider 4xx: release lease and return bounded `400`.
- Provider/system 5xx: release lease and return `503`.
- Successful password update: consume grant, clear cookie and return `200`.

## Testing strategy

TDD is required.

Regression coverage must prove:

1. generated app recovery tokens are 256-bit Base64URL values and HMAC derivation is deterministic/domain-separated;
2. reset issuance persists a grant before the email is sent and uses the generated application token in the app URL;
3. final recovery no longer calls `verifyOtp`, `getClaims`, `getUser` or browser-session `updateUser`;
4. final recovery claims a server-side grant and calls `auth.admin.updateUserById` only after a successful claim;
5. provider failure releases the claim lease;
6. success consumes the grant and clears the cookie;
7. SQL enables RLS, denies direct table access, restricts RPC execution to `service_role`, revokes prior user grants, applies expiry, and enforces the lease;
8. no recovery credential values are logged.

## Deployment

This design requires one new migration after the already-applied Phase 3 migration. Do not reapply any Phase 1/2/3 migration. Deploy code only after the new migration is applied and CI is green.
