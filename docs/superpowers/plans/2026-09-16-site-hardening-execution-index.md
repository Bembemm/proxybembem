# Site Hardening Execution Index

This file coordinates the four approved implementation plans for `hardening/site-security-nonce`. It is an execution index and self-review correction, not a fifth implementation subsystem.

## Execution order

1. `2026-09-16-csp-nonce-proxy.md`
2. `2026-09-16-rate-limit-proxy-ip.md`
3. `2026-09-16-lint-ci-seo.md`
4. `2026-09-16-supabase-auth-final-acceptance.md`

Each plan must finish its focused tests before the next plan starts. The final plan reruns the complete regression/KingHost acceptance gate.

## Self-review correction: Supabase cookie refresh + nonce headers

In the CSP/nonce plan, do not preserve a pre-refresh `Headers` snapshot across Supabase cookie mutation. `updateSupabaseSession` currently calls `request.cookies.set(...)` while refreshing auth cookies; the upstream headers used for a newly created `NextResponse.next()` must therefore be rebuilt from the current request state and then have the security values overlaid.

Use an interface shaped like:

```ts
type RequestSecurityHeaders = {
  nonce: string
  contentSecurityPolicy: string
}

function buildUpstreamHeaders(
  request: NextRequest,
  security: RequestSecurityHeaders | null,
) {
  const headers = new Headers(request.headers)
  if (security) {
    headers.set("x-nonce", security.nonce)
    headers.set("Content-Security-Policy", security.contentSecurityPolicy)
  }
  return headers
}
```

`updateSupabaseSession` should receive the small `RequestSecurityHeaders | null` value, not a long-lived cloned `Headers` object. Every time it creates or recreates `NextResponse.next()`—including inside Supabase `setAll` after `request.cookies.set(...)`—it must call `buildUpstreamHeaders(request, security)` again.

The root Proxy follows the same contract: it creates nonce/CSP values once per request; public pages build upstream headers immediately; Supabase-session routes pass the values into `updateSupabaseSession`, which rebuilds the actual header collection whenever needed. This preserves both fresh auth cookies and the same request nonce.

## Spec coverage self-review

- CSP/nonce, dynamic rendering, static-header separation: plan 1.
- Proxy-aware IP validation and KingHost trust boundary: plan 2.
- Real ESLint, distinct typecheck, CI, canonical/social metadata, robots/sitemap/noindex: plan 3.
- Free Supabase Auth hardening, paid leaked-password warning classification, Security Advisor, commerce regressions, final sandbox smoke: plan 4.
- Mercado Pago remains financial authority; Melhor Envio spending gate remains fail-closed; no plan changes financial totals/ownership rules.

## Rollback contract

No plan deploys or merges automatically. Until final owner acceptance, `main` and the current production runtime remain unchanged.

If nonce CSP breaks rendering or causes unacceptable runtime behavior, stop the sandbox candidate and reset/redeploy only the isolated sandbox to the last known-good branch SHA; do not weaken CSP directly in production.

If `RATE_LIMIT_TRUSTED_PROXY_HOPS` is not verified for KingHost, keep forwarding headers untrusted (`0`) and do not promote the candidate. Do not guess a production hop count.

If an Auth dashboard hardening setting breaks signup/login/recovery in sandbox, revert that dashboard setting first, update the branch implementation/tests, and rerun the full Auth acceptance flow before considering production.

If Security Advisor reveals a real ownership/RLS defect, treat it as a focused database security change with its own test/migration review; never add permissive policies only to clear a warning.

## Completion rule

The branch is merge-ready only when the final SHA passes `pnpm lint`, `pnpm typecheck`, `pnpm build:kinghost`, `pnpm test`, the explicit commerce/security subset, Supabase Advisor review, and the isolated KingHost sandbox smoke described in plan 4. A green branch is not the same as a production deployment.