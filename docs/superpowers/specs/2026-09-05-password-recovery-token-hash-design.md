# Password recovery token-hash design

Date: 2026-09-05
Branch: `feat/admin-dashboard-expansion`

## Goal

Replace password recovery's browser-bound PKCE callback dependency with a server-side recovery flow based on Supabase `TokenHash` + `verifyOtp({ type: "recovery" })`.

The user experience requirement is: clicking the recovery email must not consume the recovery credential. The credential is consumed only when the user actually submits a new password. Supabase's own absolute token expiry still applies.

## Current problem

The existing flow sends recovery to `/auth/callback?next=/redefinir-senha`, then calls `exchangeCodeForSession()`. That requires the PKCE verifier stored in the browser that initiated the request. Mobile email apps, custom tabs, a different browser context, overlapping recovery requests, or reused links can therefore fail with `pkce_code_verifier_not_found` or `flow_state_not_found`.

The current `/redefinir-senha` page also requires an authenticated customer session, so it cannot be reached before the PKCE exchange succeeds.

## Chosen architecture

### 1. Recovery email

The Supabase **Reset Password** email template will link to:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">
  Redefinir senha
</a>
```

Password recovery will no longer use `/auth/callback` as its email destination.

### 2. `GET /auth/confirm`

This route is recovery-specific for this change.

It will:

- accept only `type=recovery`;
- require a bounded `token_hash` value;
- never call `verifyOtp()` on GET;
- never log the token hash or full URL;
- store the token hash in a short-lived `HttpOnly`, `Secure` in production, `SameSite=Lax` recovery cookie;
- redirect immediately to clean `/redefinir-senha` so the secret leaves the address bar/history surface;
- return `Cache-Control: private, no-store`.

An email scanner or link preview may hit this GET, but it cannot consume the Supabase token.

### 3. `/redefinir-senha`

The page will no longer require a normal authenticated customer session before rendering.

It may render the password form when the server sees the recovery cookie. A forged or invalid cookie can at most render the form; the final POST still has to pass Supabase verification.

If neither a usable recovery context nor a recovery-authenticated retry context exists, redirect to `/entrar` with a safe recovery error.

The page remains `force-dynamic` and authentication/recovery responses remain uncached.

### 4. `POST /api/account/password-recovery`

Keep the existing same-origin check, request-body limits, password validation, and rate limit.

On first submit:

1. Read the recovery token hash from the `HttpOnly` cookie.
2. Call `supabase.auth.verifyOtp({ token_hash, type: "recovery" })` server-side.
3. Apply the Supabase session cookies to the response.
4. Mark this browser as being in a verified recovery attempt with a short-lived `HttpOnly` recovery marker and clear the raw recovery-token cookie.
5. Call `supabase.auth.updateUser({ password })`.
6. If password update succeeds, call `signOut({ scope: "global" })`, clear all recovery cookies, and return success.

### 5. Retry if password update fails after OTP verification

`verifyOtp()` consumes the one-time token. Therefore, if OTP verification succeeds but `updateUser()` fails, the response must preserve the newly created Supabase session plus a server-set recovery marker.

A subsequent submit may skip `verifyOtp()` only when both are true:

- the Supabase session is still valid for that user; and
- the recovery marker created by our server is present.

This avoids forcing a new email because of a transient password-update failure. Once password update succeeds, global sign-out and recovery-cookie cleanup end the recovery capability.

## Security constraints

- No open redirect: recovery success destination is fixed.
- `token_hash`, auth codes, access tokens, refresh tokens, cookie values, passwords, and email addresses are never written to diagnostic logs.
- Recovery cookies are `HttpOnly`, `SameSite=Lax`, scoped to the site, and `Secure` in production.
- Recovery cookie lifetime is short and must not exceed the expected Supabase recovery-token validity window.
- All auth/recovery route responses use `Cache-Control: private, no-store`.
- KingHost/proxy caching must not cache responses containing auth `Set-Cookie` headers.
- The existing `/auth/callback` remains for non-recovery auth flows.
- The temporary PKCE recovery diagnostics are removed after the token-hash flow is proven.

## Failure behavior

- Missing/malformed `token_hash`: redirect to a safe recovery error.
- Expired/invalid token at final submit: clear recovery cookies and return "Link de recuperação inválido ou expirado."
- `updateUser()` failure after successful verification: keep the verified recovery session/marker so the user can retry without another email.
- Global sign-out failure after successful password change: report that the password changed but all sessions could not be closed, matching the current safety behavior.

## Testing strategy

Use TDD.

RED coverage must prove at least:

1. password-reset request no longer builds a recovery `/auth/callback` redirect;
2. `/auth/confirm` accepts only recovery token-hash input and does not call `verifyOtp()` on GET;
3. `/auth/confirm` sets an HttpOnly recovery cookie, strips the token from the destination, and sends `private, no-store`;
4. `/redefinir-senha` can render from recovery context without requiring an already-authenticated customer session;
5. password-recovery POST calls `verifyOtp({ token_hash, type: "recovery" })` only on final submit;
6. successful verification + password update clears recovery context and globally signs out;
7. failed password update after successful verification preserves a retry-capable recovery session/marker;
8. no recovery token or secret values are logged.

Then run typecheck, KingHost build/startup smoke, and the full test suite before calling the runtime candidate complete.

## Supabase dashboard change

After code deployment and before the next real recovery test, update **Authentication -> Email Templates -> Reset Password** to use `{{ .TokenHash }}` and the `/auth/confirm?token_hash=...&type=recovery` link shown above.

Do not request a fresh recovery email until both the runtime deployment and email-template change are complete.
