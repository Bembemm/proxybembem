# CSP Nonce and Proxy Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static `script-src 'unsafe-inline'` with a per-request nonce while preserving Supabase session behavior and KingHost compatibility.

**Architecture:** Move request-specific CSP construction into a pure security helper. Root `proxy.ts` generates a nonce for HTML requests, forwards `x-nonce` plus the CSP to Next.js, and mirrors the CSP on the response. Supabase session refresh remains a separate path predicate so public pages do not call Auth merely because nonce CSP is enabled.

**Tech Stack:** Next.js 16.3.3 App Router/Proxy, React 19, TypeScript 5.7.3, `@supabase/ssr` 0.12.5, Node 22.1.0.

**Spec:** `docs/superpowers/specs/2026-09-16-site-security-nonce-hardening-design.md`

## Global Constraints

- Branch: `hardening/site-security-nonce`; do not modify `main` directly.
- Production hosting is KingHost; preserve the existing KingHost runtime contract.
- Keep `style-src 'unsafe-inline'` unless a separately tested change proves it can be removed safely.
- Accepted target: `script-src` must not contain `'unsafe-inline'`.
- Do not add Supabase session/auth lookups to ordinary public requests.
- Preserve Mercado Pago, Melhor Envio and Supabase origins already required by the site.
- No production deployment is part of this plan.

---

## File Structure

- Create `lib/security/content-security-policy.ts`: pure nonce generation/CSP construction and origin validation.
- Create `lib/security/proxy-routing.ts`: route predicates for CSP coverage and Supabase-session coverage.
- Modify `proxy.ts`: orchestrate CSP headers and optional Supabase session refresh.
- Modify `lib/supabase/proxy.ts`: accept upstream request headers so nonce/CSP survive session refresh/redirect responses.
- Modify `next.config.mjs`: keep static security headers but remove static CSP to prevent duplicate/conflicting policies.
- Modify `app/layout.tsx`: explicitly opt rendered pages into request-time rendering by reading request headers; no extra script plumbing is required because Next parses the nonce from request CSP.
- Modify `tests/security-headers.test.ts`: move CSP assertions away from static Next config.
- Create `tests/proxy-csp.test.ts`: nonce/CSP/request-response behavior and session-route separation.

### Task 1: Pure CSP builder

**Files:**
- Create: `lib/security/content-security-policy.ts`
- Test: `tests/proxy-csp.test.ts`

**Interfaces:**
- Produces: `createCspNonce(): string`
- Produces: `buildContentSecurityPolicy(input: { nonce: string; nodeEnv: string | undefined; melhorEnvioEnvironment: string | undefined; supabaseBrowserUrl: string | undefined }): string`

- [ ] **Step 1: Write failing CSP tests**

Create `tests/proxy-csp.test.ts` with the initial pure-function coverage:

```ts
import assert from "node:assert/strict"
import test from "node:test"
import {
  buildContentSecurityPolicy,
  createCspNonce,
} from "../lib/security/content-security-policy.ts"

test("creates a fresh base64 nonce for every call", () => {
  const first = createCspNonce()
  const second = createCspNonce()
  assert.notEqual(first, second)
  assert.match(first, /^[A-Za-z0-9+/]+={0,2}$/)
  assert.match(second, /^[A-Za-z0-9+/]+={0,2}$/)
})

test("production CSP requires the nonce and removes script unsafe-inline", () => {
  const csp = buildContentSecurityPolicy({
    nonce: "dGVzdC1ub25jZQ==",
    nodeEnv: "production",
    melhorEnvioEnvironment: "production",
    supabaseBrowserUrl: "https://example.supabase.co",
  })
  assert.match(csp, /script-src 'self' 'nonce-dGVzdC1ub25jZQ==' 'strict-dynamic'/)
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/)
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-eval'/)
  assert.match(csp, /connect-src 'self' https:\/\/example\.supabase\.co/)
  assert.match(csp, /form-action 'self' https:\/\/melhorenvio\.com\.br/)
})

test("development CSP permits unsafe-eval but never script unsafe-inline", () => {
  const csp = buildContentSecurityPolicy({
    nonce: "bm9uY2U=",
    nodeEnv: "development",
    melhorEnvioEnvironment: "sandbox",
    supabaseBrowserUrl: "https://example.supabase.co",
  })
  assert.match(csp, /script-src[^;]*'unsafe-eval'/)
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/)
  assert.match(csp, /form-action 'self' https:\/\/sandbox\.melhorenvio\.com\.br/)
})

test("invalid configured origins fail closed", () => {
  const csp = buildContentSecurityPolicy({
    nonce: "bm9uY2U=",
    nodeEnv: "production",
    melhorEnvioEnvironment: "invalid",
    supabaseBrowserUrl: "javascript:alert(1)",
  })
  assert.match(csp, /form-action 'self'(?:;|$)/)
  assert.match(csp, /connect-src 'self'(?:;|$)/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --experimental-strip-types --test tests/proxy-csp.test.ts
```

Expected: FAIL because `lib/security/content-security-policy.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure builder**

Create `lib/security/content-security-policy.ts`:

```ts
function httpsOrigin(value: string | undefined) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" ? url.origin : null
  } catch {
    return null
  }
}

function melhorEnvioOrigin(environment: string | undefined) {
  if (environment === "sandbox") return "https://sandbox.melhorenvio.com.br"
  if (environment === "production") return "https://melhorenvio.com.br"
  return null
}

export function createCspNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Buffer.from(bytes).toString("base64")
}

export function buildContentSecurityPolicy(input: {
  nonce: string
  nodeEnv: string | undefined
  melhorEnvioEnvironment: string | undefined
  supabaseBrowserUrl: string | undefined
}) {
  const supabaseOrigin = httpsOrigin(input.supabaseBrowserUrl)
  const formOrigin = melhorEnvioOrigin(input.melhorEnvioEnvironment)
  const scriptSources = [
    "'self'",
    `'nonce-${input.nonce}'`,
    "'strict-dynamic'",
    ...(input.nodeEnv === "development" ? ["'unsafe-eval'"] : []),
  ]

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `form-action 'self'${formOrigin ? ` ${formOrigin}` : ""}`,
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSources.join(" ")}`,
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    "upgrade-insecure-requests",
  ].join("; ")
}
```

If `Buffer` is rejected in Proxy compilation, keep the same interface and replace the encoding line with a browser-safe base64 encoder. Do not change the nonce format or weaken the test.

- [ ] **Step 4: Run the CSP unit test**

Run:

```bash
node --experimental-strip-types --test tests/proxy-csp.test.ts
```

Expected: PASS for the four pure CSP tests.

- [ ] **Step 5: Commit**

```bash
git add lib/security/content-security-policy.ts tests/proxy-csp.test.ts
git commit -m "test: define nonce CSP contract"
```

### Task 2: Separate routing predicates from session work

**Files:**
- Create: `lib/security/proxy-routing.ts`
- Modify: `tests/proxy-csp.test.ts`

**Interfaces:**
- Produces: `needsSupabaseSession(pathname: string): boolean`
- Produces: `needsPageCsp(pathname: string): boolean`

- [ ] **Step 1: Add failing route-predicate tests**

Append:

```ts
import {
  needsPageCsp,
  needsSupabaseSession,
} from "../lib/security/proxy-routing.ts"

test("public pages need CSP without needing Supabase session refresh", () => {
  assert.equal(needsPageCsp("/"), true)
  assert.equal(needsPageCsp("/produtos"), true)
  assert.equal(needsSupabaseSession("/"), false)
  assert.equal(needsSupabaseSession("/produtos"), false)
})

test("existing protected/auth routes keep Supabase session handling", () => {
  for (const pathname of [
    "/admin",
    "/admin/pedidos",
    "/entrar",
    "/criar-conta",
    "/esqueci-a-senha",
    "/redefinir-senha",
    "/auth/callback",
    "/auth/confirm",
    "/minha-conta",
    "/minha-conta/pedidos",
    "/api/account/login",
    "/api/checkout",
    "/api/admin/orders",
    "/api/internal/melhor-envio/oauth/start",
  ]) {
    assert.equal(needsSupabaseSession(pathname), true, pathname)
  }
})

test("static and API resources do not need page CSP", () => {
  for (const pathname of ["/_next/static/a.js", "/_next/image", "/favicon.ico", "/api/shipping/quote"]) {
    assert.equal(needsPageCsp(pathname), false, pathname)
  }
})
```

- [ ] **Step 2: Run and confirm failure**

Run the same single test file. Expected: FAIL because `proxy-routing.ts` is missing.

- [ ] **Step 3: Implement route predicates**

Create `lib/security/proxy-routing.ts` with explicit rules rather than a broad auth predicate:

```ts
const EXACT_SESSION_PATHS = new Set([
  "/entrar",
  "/criar-conta",
  "/esqueci-a-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/auth/confirm",
  "/api/checkout",
  "/api/internal/melhor-envio/oauth/start",
])

export function needsSupabaseSession(pathname: string) {
  return (
    EXACT_SESSION_PATHS.has(pathname) ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/minha-conta" ||
    pathname.startsWith("/minha-conta/") ||
    pathname.startsWith("/api/account/")
  )
}

export function needsPageCsp(pathname: string) {
  return !(
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  )
}
```

- [ ] **Step 4: Run and confirm pass**

Run `node --experimental-strip-types --test tests/proxy-csp.test.ts`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/security/proxy-routing.ts tests/proxy-csp.test.ts
git commit -m "refactor: separate proxy security routing"
```

### Task 3: Preserve nonce headers through Supabase session refresh

**Files:**
- Modify: `lib/supabase/proxy.ts`
- Modify: `tests/proxy-csp.test.ts`
- Regression: `tests/customer-auth.test.ts`, `tests/phase9-route-security.test.ts`

**Interfaces:**
- Changes `updateSupabaseSession(request: NextRequest)` to `updateSupabaseSession(request: NextRequest, requestHeaders?: Headers)`.
- Every `NextResponse.next` created inside the function must use `requestHeaders ?? request.headers` as upstream request headers.

- [ ] **Step 1: Add a source-contract test**

Append a test that reads `lib/supabase/proxy.ts` and asserts an optional `requestHeaders` parameter is consumed in both initial response creation and cookie-refresh response recreation. This test protects against a nonce disappearing only after Supabase rotates cookies.

- [ ] **Step 2: Run the focused tests and confirm failure**

```bash
node --experimental-strip-types --test tests/proxy-csp.test.ts tests/customer-auth.test.ts tests/phase9-route-security.test.ts
```

Expected: new source-contract test FAILS; existing auth tests remain PASS.

- [ ] **Step 3: Modify `updateSupabaseSession`**

Use one helper inside `lib/supabase/proxy.ts`:

```ts
function nextResponse(request: NextRequest, requestHeaders?: Headers) {
  return NextResponse.next({
    request: { headers: requestHeaders ?? request.headers },
  })
}
```

Initialize and recreate `supabaseResponse` through `nextResponse(...)`. Do not alter the existing cookie-copy, admin redirect, `getClaims()` or private-cache behavior.

- [ ] **Step 4: Run focused auth/CSP tests**

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/proxy.ts tests/proxy-csp.test.ts
git commit -m "refactor: preserve security headers through auth proxy"
```

### Task 4: Make root Proxy own request-specific CSP

**Files:**
- Modify: `proxy.ts`
- Modify: `tests/proxy-csp.test.ts`

**Interfaces:**
- Consumes `createCspNonce`, `buildContentSecurityPolicy`, `needsPageCsp`, `needsSupabaseSession`.
- Produces request header `x-nonce` only on page-CSP requests.
- Produces identical `Content-Security-Policy` on upstream request and downstream response for page-CSP requests.

- [ ] **Step 1: Add failing source/integration contract tests**

Cover these facts:

```ts
assert.match(proxySource, /x-nonce/)
assert.match(proxySource, /Content-Security-Policy/)
assert.match(proxySource, /needsSupabaseSession/)
assert.match(proxySource, /needsPageCsp/)
```

Also assert the matcher contains a broad page matcher excluding `_next/static`, `_next/image`, image/static assets and prefetch requests, plus explicit protected API matchers.

- [ ] **Step 2: Confirm failure**

Run `tests/proxy-csp.test.ts`.

- [ ] **Step 3: Implement orchestration in `proxy.ts`**

The control flow must be:

```ts
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const pageCsp = needsPageCsp(pathname)
  const requestHeaders = new Headers(request.headers)
  let csp: string | null = null

  if (pageCsp) {
    const nonce = createCspNonce()
    csp = buildContentSecurityPolicy({
      nonce,
      nodeEnv: process.env.NODE_ENV,
      melhorEnvioEnvironment: process.env.MELHOR_ENVIO_ENVIRONMENT,
      supabaseBrowserUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    })
    requestHeaders.set("x-nonce", nonce)
    requestHeaders.set("Content-Security-Policy", csp)
  }

  const response = needsSupabaseSession(pathname)
    ? await updateSupabaseSession(request, requestHeaders)
    : NextResponse.next({ request: { headers: requestHeaders } })

  if (csp) response.headers.set("Content-Security-Policy", csp)
  return response
}
```

Do not copy all incoming request headers to response headers.

Configure matcher so pages are processed for nonce CSP but static assets/prefetches are skipped. Keep protected API routes explicitly matched for session behavior.

- [ ] **Step 4: Run focused tests**

```bash
node --experimental-strip-types --test tests/proxy-csp.test.ts tests/customer-auth.test.ts tests/phase9-route-security.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proxy.ts tests/proxy-csp.test.ts
git commit -m "feat: add per-request nonce CSP"
```

### Task 5: Remove the conflicting static CSP and force request-time page rendering

**Files:**
- Modify: `next.config.mjs`
- Modify: `app/layout.tsx`
- Modify: `tests/security-headers.test.ts`
- Modify: `tests/proxy-csp.test.ts`

**Interfaces:**
- Static security headers remain in `next.config.mjs` except CSP.
- `RootLayout` reads request headers (`await headers()`) so pages using nonce CSP are rendered in request context.

- [ ] **Step 1: Change tests first**

Update `tests/security-headers.test.ts` to assert static headers still contain HSTS/nosniff/X-Frame/Referrer/Permissions but do **not** define `Content-Security-Policy` in `next.config.mjs`.

Add to `tests/proxy-csp.test.ts`:

```ts
const nextConfig = await readFile(new URL("../next.config.mjs", import.meta.url), "utf8")
assert.doesNotMatch(nextConfig, /key:\s*["']Content-Security-Policy["']/)
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8")
assert.match(layout, /headers\(\)/)
```

- [ ] **Step 2: Run and confirm failure**

Run both security test files. Expected: FAIL until static CSP is removed/layout is request-aware.

- [ ] **Step 3: Update Next config and layout**

Remove only the static CSP entry/building code from `next.config.mjs`; retain Supabase image remote pattern, redirects and non-CSP security headers.

In `app/layout.tsx`:

```ts
import { headers } from "next/headers"

export default async function RootLayout(...) {
  await headers()
  const storeSettings = await getPublicStoreSettings()
  ...
}
```

Do not expose `x-nonce` in rendered HTML or client props unless a future explicit `<Script nonce>` requires it.

- [ ] **Step 4: Run security + storefront regressions**

```bash
node --experimental-strip-types --test \
  tests/security-headers.test.ts \
  tests/proxy-csp.test.ts \
  tests/storefront-purchase-flow-ui.test.ts \
  tests/product-catalog-navigation-cache.test.ts \
  tests/authenticated-checkout-ui.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run KingHost build**

```bash
pnpm typecheck
pnpm build:kinghost
```

Expected: PASS; no nonce/static-render build error.

- [ ] **Step 6: Commit**

```bash
git add next.config.mjs app/layout.tsx tests/security-headers.test.ts tests/proxy-csp.test.ts
git commit -m "feat: enforce nonce-only script policy"
```

### Task 6: Full CSP regression checkpoint

**Files:** No source changes expected.

- [ ] **Step 1: Run the full Node test suite**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run exact KingHost verification**

```bash
pnpm typecheck
pnpm build:kinghost
```

Expected: PASS on the repository's Node 22.1.0 runtime contract.

- [ ] **Step 3: Record CSP assumptions in the hardening evidence doc used by the final plan**

Record that `script-src` is nonce-based, `style-src 'unsafe-inline'` intentionally remains, and public pages are request-rendered because nonce CSP is per request. Do not claim production acceptance until sandbox smoke has been performed.

- [ ] **Step 4: Commit only if evidence documentation changed**

```bash
git add docs/superpowers
git commit -m "docs: record nonce CSP verification"
```
