# Lint CI and Technical SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real Next.js ESLint gates and complete technical SEO without exposing transactional/private routes.

**Architecture:** Use ESLint flat config with Next Core Web Vitals and keep TypeScript typecheck separate. SEO stays framework-native through root Metadata plus `robots.ts`/`sitemap.ts`; private route groups explicitly opt out of indexing.

**Tech Stack:** Next.js 16.3.3, ESLint 9, `eslint-config-next` 16.3.3, TypeScript 5.7.3, GitHub Actions, Next Metadata API.

**Spec:** `docs/superpowers/specs/2026-09-16-site-security-nonce-hardening-design.md`

## Global Constraints

- Match `eslint-config-next` to installed Next version `16.3.3`.
- Do not replace typecheck with lint; both gates are required.
- Do not index `/admin/**`, `/minha-conta/**`, `/checkout`, account-auth/recovery pages or callback endpoints.
- Canonical production origin is `https://www.proxybembem.com.br`.

---

## File Structure

- Create `eslint.config.mjs`.
- Modify `package.json` and `pnpm-lock.yaml` via pnpm, never hand-edit lock dependency resolution.
- Modify `.github/workflows/ci.yml` to run lint separately.
- Create `tests/tooling-seo.test.ts` for stable source/metadata contracts.
- Modify `app/layout.tsx` root metadata.
- Create `app/robots.ts`, `app/sitemap.ts`, `app/minha-conta/layout.tsx`.
- Modify auth/checkout metadata pages to `noindex`.

### Task 1: Install real ESLint and create a flat config

**Files:**
- Create: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `tests/tooling-seo.test.ts`

- [ ] **Step 1: Write the failing tooling contract**

```ts
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("lint is a real ESLint gate separate from typecheck", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
  assert.equal(pkg.scripts.lint, "eslint . --max-warnings=0")
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit")
  assert.notEqual(pkg.scripts.lint, pkg.scripts.typecheck)

  const config = await readFile(new URL("../eslint.config.mjs", import.meta.url), "utf8")
  assert.match(config, /eslint-config-next\/core-web-vitals/)
})
```

- [ ] **Step 2: Confirm failure**

```bash
node --experimental-strip-types --test tests/tooling-seo.test.ts
```

Expected: FAIL because lint still aliases typecheck and config is absent.

- [ ] **Step 3: Install matching dependencies**

```bash
pnpm add -D eslint@^9 eslint-config-next@16.3.3
```

This command must update both `package.json` and `pnpm-lock.yaml`.

- [ ] **Step 4: Create flat config**

```js
import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    ".vercel/**",
    "next-env.d.ts",
  ]),
])
```

Change script to:

```json
"lint": "eslint . --max-warnings=0"
```

- [ ] **Step 5: Run lint and test**

```bash
pnpm lint
node --experimental-strip-types --test tests/tooling-seo.test.ts
```

Expected: tooling test PASS. If ESLint reports existing source findings, fix each source finding directly before committing; do not globally disable Core Web Vitals or TypeScript rules. A narrow disable is permitted only beside an intentional construct with an explanatory comment.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs package.json pnpm-lock.yaml tests/tooling-seo.test.ts
git commit -m "build: add real Next.js lint gate"
```

### Task 2: Require lint in CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/tooling-seo.test.ts`

- [ ] **Step 1: Add failing CI contract**

Read `.github/workflows/ci.yml` and assert it contains `pnpm lint` before `pnpm typecheck` and still contains `pnpm build` and `pnpm test`.

- [ ] **Step 2: Confirm failure**

Run `tests/tooling-seo.test.ts`; expected new assertion FAILS.

- [ ] **Step 3: Add CI lint step**

Insert after frozen install:

```yaml
      - run: pnpm lint
      - run: pnpm typecheck
```

Do not alter the exact Node.js 22.x build runtime or Node 24 raw-TypeScript test-runner rationale.

- [ ] **Step 4: Run tooling contract**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml tests/tooling-seo.test.ts
git commit -m "ci: require lint before build"
```

### Task 3: Root canonical and social metadata

**Files:**
- Modify: `app/layout.tsx`
- Modify: `tests/tooling-seo.test.ts`

- [ ] **Step 1: Add metadata contract**

Assert root layout contains:

```ts
metadataBase: new URL("https://www.proxybembem.com.br")
alternates: { canonical: "/" }
openGraph: { type: "website", locale: "pt_BR", siteName: "ProxyBembem" }
twitter: { card: "summary_large_image" }
```

Keep the existing title, description and `/brand/pb` icons.

- [ ] **Step 2: Confirm failure**

Run tooling SEO test; expected metadata assertions FAIL.

- [ ] **Step 3: Extend root metadata**

Use Next's `Metadata` object and avoid hard-coded noncanonical host variants. Social title/description may reuse the existing root values; no new marketing claims are required.

- [ ] **Step 4: Run test and typecheck**

```bash
node --experimental-strip-types --test tests/tooling-seo.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx tests/tooling-seo.test.ts
git commit -m "feat: add canonical social metadata"
```

### Task 4: Framework-native robots and sitemap

**Files:**
- Create: `app/robots.ts`
- Create: `app/sitemap.ts`
- Modify: `tests/tooling-seo.test.ts`

- [ ] **Step 1: Add tests for exact public/private route policy**

The expected sitemap URLs are exactly:

```ts
[
  "https://www.proxybembem.com.br/",
  "https://www.proxybembem.com.br/produtos",
  "https://www.proxybembem.com.br/contato",
  "https://www.proxybembem.com.br/privacidade",
  "https://www.proxybembem.com.br/termos",
]
```

Robots must allow `/` and disallow:

```ts
["/admin/", "/minha-conta/", "/checkout", "/entrar", "/criar-conta", "/esqueci-a-senha", "/redefinir-senha", "/auth/"]
```

Sitemap location must be `https://www.proxybembem.com.br/sitemap.xml`.

- [ ] **Step 2: Confirm failure**

Run tooling SEO test; expected missing modules FAIL.

- [ ] **Step 3: Create metadata routes**

`app/robots.ts` should return `MetadataRoute.Robots`; `app/sitemap.ts` should return `MetadataRoute.Sitemap` using the canonical origin constant inside each small module. Do not query Supabase from either route.

- [ ] **Step 4: Run test/typecheck/build**

```bash
node --experimental-strip-types --test tests/tooling-seo.test.ts
pnpm typecheck
pnpm build
```

Expected: PASS and generated routes include `/robots.txt` and `/sitemap.xml`.

- [ ] **Step 5: Commit**

```bash
git add app/robots.ts app/sitemap.ts tests/tooling-seo.test.ts
git commit -m "feat: add robots and sitemap metadata routes"
```

### Task 5: Explicit noindex for account/auth/transactional pages

**Files:**
- Create: `app/minha-conta/layout.tsx`
- Modify: `app/checkout/page.tsx`
- Modify: `app/entrar/page.tsx`
- Modify: `app/criar-conta/page.tsx`
- Modify: `app/esqueci-a-senha/page.tsx`
- Modify: `app/redefinir-senha/page.tsx`
- Modify: `app/cadastro-recebido/page.tsx`
- Modify: `tests/tooling-seo.test.ts`

- [ ] **Step 1: Add failing noindex source contracts**

Require each listed transactional/auth route to export/inherit:

```ts
robots: { index: false, follow: false }
```

The new `app/minha-conta/layout.tsx` should apply that metadata once to all private customer subroutes:

```tsx
import type { Metadata } from "next"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function CustomerAccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
```

- [ ] **Step 2: Confirm failure**

Run tooling SEO test.

- [ ] **Step 3: Add noindex metadata without changing UI behavior**

For `checkout/page.tsx`, add `Metadata` import/export beside the existing component render. For pages with existing metadata, extend that object only; preserve titles/descriptions.

- [ ] **Step 4: Run SEO and route regressions**

```bash
node --experimental-strip-types --test \
  tests/tooling-seo.test.ts \
  tests/private-order-only.test.ts \
  tests/customer-account-security.test.ts \
  tests/authenticated-checkout-ui.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/minha-conta/layout.tsx app/checkout/page.tsx app/entrar/page.tsx app/criar-conta/page.tsx app/esqueci-a-senha/page.tsx app/redefinir-senha/page.tsx app/cadastro-recebido/page.tsx tests/tooling-seo.test.ts
git commit -m "feat: exclude private transaction routes from indexing"
```

### Task 6: Quality checkpoint

- [ ] **Step 1: Run all gates in CI order**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Expected: all PASS.

- [ ] **Step 2: Verify build route contract**

Use the existing CI manifest check: public `/pedido/` must remain absent and `/minha-conta/pedidos/[id]/page` must remain present.

- [ ] **Step 3: Commit only additional lint fixes found by the full gate**

Any such commit must name the actual finding, e.g. `fix: satisfy Next image lint in storefront`, not disable the rule globally.