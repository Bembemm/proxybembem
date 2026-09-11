# ProxyBembem KingHost Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing ProxyBembem Next.js runtime from Vercel to KingHost Node.js III without changing the hosted Supabase backend or losing the current Phase 3 Task 14 checkpoint.

**Architecture:** Keep `feat/admin-dashboard-expansion` as the migration branch. Build Next.js with `output: "standalone"`, package the standalone static/public assets, and use a small root `app.js` adapter that maps KingHost's `PORT_APP` to Next's `PORT` before loading `.next/standalone/server.js`. Preserve Vercel as rollback until KingHost passes acceptance; production security must work both on Vercel and on non-Vercel `NODE_ENV=production` runtimes during the transition.

**Tech Stack:** Next.js 16.3.3, React 19, Node.js 20.18.0 on KingHost, pnpm 10, GitHub Actions, Supabase hosted project, Mercado Pago, Melhor Envio.

**Spec:** `docs/superpowers/specs/2026-09-02-kinghost-migration-design.md`

## Global Constraints

- KingHost runtime is Node.js `20.18.0`.
- KingHost application is `proxybembem`, web path `/`, source directory `/apps_nodejs/proxybembem/`.
- KingHost application port is environment-managed; never hard-code `21169` or another allocated port.
- Existing Supabase `ProxyBembem` project remains the production database/Auth backend.
- Supabase migration `20260902220354_customer_accounts_orders` is already applied; never reapply it for this migration.
- Preserve Phase 3 Tasks 1–13 and resume from Task 14; do not start Phase 4.
- Vercel remains rollback until explicit owner approval after KingHost acceptance.
- Never commit production secrets or paste passwords/TOTP/provider keys into docs, tests, or chat.
- Preserve checkout-origin, provider-environment, admin-auth, customer-isolation, guest-claim, DTO-redaction, HTTPS and CSP safeguards.
- No merge to `main` solely to perform this hosting migration.

---

### Task 1: KingHost-compatible standalone runtime

**Files:**
- Create: `app.js`
- Create: `scripts/prepare-kinghost.mjs`
- Modify: `next.config.mjs`
- Modify: `package.json`
- Create: `tests/kinghost-runtime.test.ts`
- Modify: `tests/security-headers.test.ts`

**Interfaces:**
- Consumes: KingHost environment variable `PORT_APP`; standard `PORT` and `HOSTNAME`; Next standalone output at `.next/standalone/server.js`.
- Produces: `resolveKingHostPort(env): string`, root `app.js` startup adapter, `pnpm build:kinghost`, packaged `.next/standalone/public` and `.next/standalone/.next/static`.

- [ ] **Step 1: Write the failing KingHost runtime test**

Create `tests/kinghost-runtime.test.ts`:

```ts
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFile } from "node:fs/promises"
import test from "node:test"

const require = createRequire(import.meta.url)

const { resolveKingHostPort } = require("../app.js") as {
  resolveKingHostPort(env: Record<string, string | undefined>): string
}

test("KingHost runtime prefers PORT_APP without hard-coding the allocated port", () => {
  assert.equal(resolveKingHostPort({ PORT_APP: "21169", PORT: "3000" }), "21169")
  assert.equal(resolveKingHostPort({ PORT: "4321" }), "4321")
  assert.equal(resolveKingHostPort({}), "3000")
})

test("KingHost runtime rejects invalid ports", () => {
  assert.throws(() => resolveKingHostPort({ PORT_APP: "abc" }), /valid port/i)
  assert.throws(() => resolveKingHostPort({ PORT_APP: "70000" }), /valid port/i)
})

test("Next config emits standalone output", async () => {
  const source = await readFile(new URL("../next.config.mjs", import.meta.url), "utf8")
  assert.match(source, /output:\s*["']standalone["']/)
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm test -- tests/kinghost-runtime.test.ts
```

Expected: FAIL because `app.js` and standalone configuration do not exist yet.

- [ ] **Step 3: Add the KingHost entrypoint**

Create `app.js`:

```js
const path = require("node:path")

function resolveKingHostPort(env = process.env) {
  const raw = env.PORT_APP || env.PORT || "3000"
  const port = Number.parseInt(raw, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== String(raw).trim()) {
    throw new Error("KingHost runtime requires a valid port")
  }
  return String(port)
}

function startKingHostRuntime() {
  process.env.PORT = resolveKingHostPort(process.env)
  process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0"
  require(path.join(__dirname, ".next", "standalone", "server.js"))
}

if (require.main === module) {
  startKingHostRuntime()
}

module.exports = { resolveKingHostPort, startKingHostRuntime }
```

Do not embed the currently allocated port `21169`; it may change.

- [ ] **Step 4: Add standalone packaging**

Create `scripts/prepare-kinghost.mjs`:

```js
import { cp, mkdir, rm } from "node:fs/promises"

const root = new URL("../", import.meta.url)
const standalone = new URL("../.next/standalone/", import.meta.url)
const standalonePublic = new URL("../.next/standalone/public/", import.meta.url)
const standaloneStatic = new URL("../.next/standalone/.next/static/", import.meta.url)

await rm(standalonePublic, { recursive: true, force: true })
await rm(standaloneStatic, { recursive: true, force: true })
await mkdir(standalonePublic, { recursive: true })
await mkdir(standaloneStatic, { recursive: true })
await cp(new URL("public/", root), standalonePublic, { recursive: true })
await cp(new URL(".next/static/", root), standaloneStatic, { recursive: true })

console.log(`KingHost standalone package prepared at ${standalone.pathname}`)
```

Modify `package.json` scripts:

```json
"build": "next build",
"build:kinghost": "next build && node scripts/prepare-kinghost.mjs",
"start": "next start"
```

- [ ] **Step 5: Make Next emit standalone and make HSTS provider-neutral**

In `next.config.mjs`, replace the Vercel-only production flag with:

```js
const isProductionDeployment = process.env.VERCEL_ENV
  ? process.env.VERCEL_ENV === "production"
  : process.env.NODE_ENV === "production"
```

Add to `nextConfig`:

```js
output: "standalone",
```

Keep all existing security headers. This preserves Vercel Preview behavior while enabling HSTS on KingHost `NODE_ENV=production`.

Update the HSTS assertion in `tests/security-headers.test.ts` so it requires both the Vercel compatibility branch and the provider-neutral `NODE_ENV` fallback:

```ts
assert.match(source, /VERCEL_ENV/)
assert.match(source, /NODE_ENV/)
assert.match(source, /max-age=31536000; includeSubDomains/)
```

- [ ] **Step 6: Run focused GREEN tests**

Run:

```bash
pnpm test -- tests/kinghost-runtime.test.ts tests/security-headers.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the KingHost build package**

Run:

```bash
pnpm build:kinghost
```

Expected: PASS and these paths exist:

```text
.next/standalone/server.js
.next/standalone/public/
.next/standalone/.next/static/
```

- [ ] **Step 8: Commit Task 1**

```bash
git add app.js scripts/prepare-kinghost.mjs next.config.mjs package.json tests/kinghost-runtime.test.ts tests/security-headers.test.ts
git commit -m "feat: add kinghost standalone runtime"
```

---

### Task 2: Remove runtime Vercel Analytics coupling without changing application behavior

**Files:**
- Modify: `app/layout.tsx`
- Modify: `next.config.mjs`
- Create: `tests/provider-neutral-runtime.test.ts`

**Interfaces:**
- Consumes: existing root layout and CSP.
- Produces: provider-neutral production HTML and CSP with no Vercel Analytics network dependency.

- [ ] **Step 1: Write the failing provider-neutral test**

Create `tests/provider-neutral-runtime.test.ts`:

```ts
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const layout = new URL("../app/layout.tsx", import.meta.url)
const config = new URL("../next.config.mjs", import.meta.url)

test("runtime no longer emits Vercel Analytics client integration", async () => {
  const [layoutSource, configSource] = await Promise.all([
    readFile(layout, "utf8"),
    readFile(config, "utf8"),
  ])

  assert.doesNotMatch(layoutSource, /@vercel\/analytics/)
  assert.doesNotMatch(layoutSource, /<Analytics\s*\/>/)
  assert.doesNotMatch(configSource, /va\.vercel-scripts\.com/)
  assert.doesNotMatch(configSource, /vitals\.vercel-insights\.com/)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm test -- tests/provider-neutral-runtime.test.ts
```

Expected: FAIL because `app/layout.tsx` imports/renders Vercel Analytics and CSP allowlists its endpoints.

- [ ] **Step 3: Remove only the runtime integration**

In `app/layout.tsx`:

- remove `import { Analytics } from "@vercel/analytics/next"`;
- remove `{process.env.NODE_ENV === "production" && <Analytics />}`.

In `next.config.mjs` change:

```js
"script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
`connect-src 'self' https://vitals.vercel-insights.com${supabaseBrowserOrigin ? ` ${supabaseBrowserOrigin}` : ""}`,
```

into:

```js
"script-src 'self' 'unsafe-inline'",
`connect-src 'self'${supabaseBrowserOrigin ? ` ${supabaseBrowserOrigin}` : ""}`,
```

Do not remove the package from `package.json` in this migration task; leaving an unused dependency avoids a lockfile-only churn and creates no runtime request. Dependency cleanup can happen after cutover.

- [ ] **Step 4: Run GREEN tests**

Run:

```bash
pnpm test -- tests/provider-neutral-runtime.test.ts tests/security-headers.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add app/layout.tsx next.config.mjs tests/provider-neutral-runtime.test.ts
git commit -m "refactor: remove vercel analytics runtime coupling"
```

---

### Task 3: Verify the exact KingHost runtime candidate on Node 20.18

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/superpowers/CURRENT_STATUS.md`

**Interfaces:**
- Consumes: Tasks 1–2 migration candidate.
- Produces: CI proof using KingHost's Node major/runtime floor and a checkpoint that preserves Phase 3 Task 14.

- [ ] **Step 1: Pin CI verification to the KingHost runtime version**

In `.github/workflows/ci.yml`, change:

```yaml
node-version: 24
```

to:

```yaml
node-version: 20.18.0
```

Change the final build command from:

```yaml
- run: pnpm build
```

to:

```yaml
- run: pnpm build:kinghost
```

Keep `pnpm install --frozen-lockfile`, `pnpm test` and `pnpm typecheck` unchanged.

- [ ] **Step 2: Run the full local gate when a working checkout is available**

Run:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build:kinghost
```

Expected: all PASS.

- [ ] **Step 3: Update the continuation checkpoint without marking Task 14 complete**

Append a KingHost migration section to `docs/superpowers/CURRENT_STATUS.md` recording:

```text
Infrastructure migration in progress: Vercel -> KingHost Node.js III.
Supabase remains hosted and unchanged.
Phase 3 remains at Task 14; Tasks 1-13 are not to be repeated.
KingHost app: proxybembem, Node 20.18.0, web path /.
Vercel deletion remains forbidden until owner acceptance after KingHost smoke/account checks.
```

Record the exact migration commit SHA and CI run only after they exist; do not fabricate PASS evidence.

- [ ] **Step 4: Commit Task 3**

```bash
git add .github/workflows/ci.yml docs/superpowers/CURRENT_STATUS.md
git commit -m "ci: verify kinghost node runtime"
```

- [ ] **Step 5: Confirm GitHub Actions GREEN before server cutover**

Expected CI gate:

```text
pnpm install --frozen-lockfile: PASS
pnpm test: PASS
pnpm typecheck: PASS
pnpm build:kinghost: PASS
```

Do not proceed to final Vercel removal on a failing or pending candidate.

---

### Task 4: Deploy and accept the candidate on KingHost without exposing secrets

**Files:**
- No secret-bearing repository files.
- Operational configuration: KingHost Node.js panel, KingHost SSH, Supabase Auth URL configuration, Mercado Pago callback/webhook settings, Melhor Envio redirect URI when required.

**Interfaces:**
- Consumes: exact GREEN GitHub candidate, KingHost Git sync at `/apps_nodejs/proxybembem/`, KingHost `PORT_APP`, production environment values.
- Produces: HTTPS KingHost runtime serving `proxybembem.com.br` and Phase 3 Task 14 acceptance evidence.

- [ ] **Step 1: Verify KingHost source synchronization**

Through KingHost SSH, without sharing credentials in chat:

```bash
cd ~/apps_nodejs/proxybembem
pwd
git rev-parse HEAD
node --version
```

Expected:

```text
/home/proxybembem/apps_nodejs/proxybembem
<exact GREEN migration SHA>
v20.18.0
```

If the KingHost Git integration does not expose `.git`, verify the deployed files/commit marker through the panel instead and do not guess the SHA.

- [ ] **Step 2: Install dependencies and build the standalone package on KingHost**

Use pnpm 10 without requiring a global install:

```bash
cd ~/apps_nodejs/proxybembem
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 build:kinghost
```

Expected: build PASS and `.next/standalone/server.js` exists.

If the 512 MB hosting limit causes an OOM during the build, stop here. Do not lower security or delete Vercel. The fallback is to build the same standalone artifact in GitHub Actions and transfer only the packaged runtime over SFTP; that becomes a separate reviewed deployment task rather than silently changing architecture.

- [ ] **Step 3: Configure production environment variables outside Git**

Set these on KingHost through the supported environment mechanism/SSH profile, reusing the production values from the current deployment without exposing them in chat:

```text
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=<canonical https://proxybembem.com.br or approved www origin>
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL
SUPABASE_SECRET_KEY
ADMIN_USER_ID
MERCADO_PAGO_ENVIRONMENT=production
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
MELHOR_ENVIO_ENVIRONMENT=production
MELHOR_ENVIO_CLIENT_ID
MELHOR_ENVIO_CLIENT_SECRET
MELHOR_ENVIO_REDIRECT_URI
MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY
MELHOR_ENVIO_USER_AGENT
SHIPPING_ORIGIN_CEP
SHIPPING_QUOTE_SECRET
CRON_SECRET
RATE_LIMIT_SECRET
```

Never set a server secret under a `NEXT_PUBLIC_` name.

- [ ] **Step 4: Start the KingHost application**

KingHost panel application settings must be:

```text
Node.js: 20.18.0
Application: proxybembem
Path: /
Script: app.js
Web access: enabled
Direct port access: optional/not required for public production
Auto Reload: disabled during initial acceptance
```

Start/restart through the KingHost panel so its PM2 management remains authoritative.

- [ ] **Step 5: Validate DNS and SSL before payment/account acceptance**

Expected:

```text
https://proxybembem.com.br -> valid KingHost-backed HTTPS response
```

Do not continue with production checkout/provider callbacks over plain HTTP or an invalid certificate.

- [ ] **Step 6: Run automated/public smoke on the KingHost origin**

Verify:

```text
GET / -> 200
GET /produtos -> 200
GET /pedido/not-a-valid-token -> safe 404/no data
GET /minha-conta without session -> redirect to /entrar
GET /minha-conta/pedidos without session -> redirect to /entrar
checkout missing/invalid email -> rejected before payment preference creation
```

Review application logs after these requests and confirm the prior anonymous protected-page errors do not recur.

- [ ] **Step 7: Complete the pending Phase 3 Task 14 owner-auth acceptance**

Owner uses normal Supabase Auth verification; no credentials/codes are shared in chat. Verify:

```text
login
/minha-conta
/minha-conta/pedidos
own order detail
profile
security page
second account cannot access first account order UUID
safe deliberately-created guest order can be claimed only with verified matching email + 64-char token
```

No real Mercado Pago payment is required for the guest-claim test.

- [ ] **Step 8: Review KingHost/application error logs**

Expected: no migration-introduced fatal errors, no customer private-read error before anonymous redirect, no provider environment safety failures, no exposed secrets.

- [ ] **Step 9: Owner final cutover approval**

Only after Steps 1–8 pass, ask explicitly whether the owner approves deleting the Vercel project. Do not infer approval from earlier migration approval.

- [ ] **Step 10: Delete Vercel only after explicit approval, then resume Phase 3 Task 15**

After deletion, update `docs/superpowers/CURRENT_STATUS.md` with the accepted KingHost runtime evidence and continue from Phase 3 Task 15. Never restart Tasks 1–13 or reapply the Supabase migration.
