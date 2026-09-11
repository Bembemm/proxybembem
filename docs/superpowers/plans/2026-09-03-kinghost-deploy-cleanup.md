# KingHost Deployment Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the proven KingHost deployment workaround into a clean, tested deployment interface and retire active Vercel runtime configuration.

**Architecture:** Keep the Next.js application untouched. Move KingHost packaging into `scripts/kinghost/`, add one asset publisher that copies browser assets into the KingHost webroot without deleting unrelated files, keep `build:kinghost` CI-safe, and expose `deploy:kinghost` only for the hosting server.

**Tech Stack:** Next.js 16.3.3, Node.js 22.1.0, pnpm 10, Node `fs/promises`, GitHub Actions, KingHost Node.js III.

**Spec:** `docs/superpowers/specs/2026-09-03-kinghost-deploy-cleanup-design.md`

## Global Constraints

- KingHost runtime is Node.js `22.1.0`.
- `app.js` stays at repository root because the KingHost panel invokes it directly.
- Application web path remains `/`.
- Never hard-code the currently allocated KingHost port.
- `build:kinghost` must not write outside the repository.
- `deploy:kinghost` may publish only project browser assets into the configured webroot.
- Never remove or recreate the whole `~/www` directory.
- Preserve unrelated webroot files and previous hashed Next assets.
- No Supabase schema/data changes.
- No application feature changes.

---

### Task 1: Add a tested KingHost webroot asset publisher

**Files:**
- Create: `tests/kinghost-deploy.test.ts`
- Create: `scripts/kinghost/publish-assets.mjs`

**Interfaces:**
- Consumes: project `public/`, project `.next/static/`, optional `KINGHOST_PROJECT_ROOT`, optional `KINGHOST_WEB_ROOT`.
- Produces: project public files under the webroot root and Next static files under `<webroot>/_next/static/`.

- [ ] **Step 1: Write the failing publisher test**

Create a test that builds a temporary fake project and fake webroot, asserts the publisher script exists, runs it with path overrides, and verifies:

```text
public/logo.png                  -> webroot/logo.png
public/products/card.txt         -> webroot/products/card.txt
.next/static/css/app.css         -> webroot/_next/static/css/app.css
webroot/keep.txt                 -> still present
webroot/_next/static/old.js      -> still present
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm test
```

Expected: exactly the new deployment test fails because `scripts/kinghost/publish-assets.mjs` does not exist yet.

- [ ] **Step 3: Implement the publisher**

Implement `publishKingHostAssets({ projectRoot, webRoot })` with `fs/promises`:

```js
export async function publishKingHostAssets({ projectRoot, webRoot })
```

Requirements:

- resolve and validate `public/` and `.next/static/` before mutating the destination;
- copy directory contents, not an extra `public` or `static` wrapper directory;
- create destination directories as needed;
- overwrite same-name project files;
- preserve all unrelated existing destination files;
- default project root to repository root;
- default webroot to `$HOME/www`;
- support `KINGHOST_PROJECT_ROOT` / `KINGHOST_WEB_ROOT` when invoked as CLI.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm test
```

Expected: all tests pass.

---

### Task 2: Consolidate KingHost packaging and commands

**Files:**
- Create: `scripts/kinghost/prepare-standalone.mjs`
- Delete: `scripts/prepare-kinghost.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm build:kinghost` and `pnpm deploy:kinghost`.

- [ ] **Step 1: Move the standalone preparation logic**

Move the existing standalone copy behavior into `scripts/kinghost/prepare-standalone.mjs`, updating relative paths for the new directory.

- [ ] **Step 2: Update package scripts**

Use:

```json
"build:kinghost": "next build --webpack && node scripts/kinghost/prepare-standalone.mjs",
"deploy:kinghost": "pnpm build:kinghost && node scripts/kinghost/publish-assets.mjs"
```

Do not make `build:kinghost` publish to `$HOME/www`.

- [ ] **Step 3: Run tests and build**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build:kinghost
```

Expected: all PASS and `.next/standalone/server.js`, `.next/standalone/public/`, `.next/standalone/.next/static/` exist.

---

### Task 3: Retire active Vercel runtime configuration

**Files:**
- Modify: `tests/security-headers.test.ts`
- Modify: `next.config.mjs`
- Delete: `vercel.json`

**Interfaces:**
- Production deployment detection becomes `process.env.NODE_ENV === "production"`.

- [ ] **Step 1: Change the HSTS contract to RED**

Change the HSTS source contract so it requires `NODE_ENV`, requires `production`, and rejects `VERCEL_ENV`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm test
```

Expected: only the updated HSTS contract fails because `next.config.mjs` still references `VERCEL_ENV`.

- [ ] **Step 3: Remove Vercel-specific production detection**

Replace the provider branch with:

```js
const isProductionDeployment = process.env.NODE_ENV === "production"
```

Delete `vercel.json`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm test
```

Expected: all tests pass.

---

### Task 4: Align CI and operating documentation

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `docs/deployment/kinghost.md`
- Modify: `docs/superpowers/CURRENT_STATUS.md`

**Interfaces:**
- CI uses Node.js 22.1.0 once for the whole verification job.
- Canonical operator procedure becomes `pnpm deploy:kinghost` followed by a KingHost panel restart.

- [ ] **Step 1: Simplify CI**

Use one `actions/setup-node@v4` step with:

```yaml
node-version: 22.1.0
cache: pnpm
```

Then run frozen install, tests, typecheck and `pnpm build:kinghost`. CI must never run `deploy:kinghost`.

- [ ] **Step 2: Add the canonical KingHost runbook**

Document:

```bash
cd ~/apps_nodejs/proxybembem
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 deploy:kinghost
```

Then restart through the KingHost panel and verify `/`, one `public/` asset, one CSS asset and one JS asset.

- [ ] **Step 3: Update the continuation checkpoint**

Record:

- KingHost Node.js 22.1.0;
- public root routing proven healthy;
- KingHost webroot asset behavior proven and fixed;
- Vercel is no longer the runtime/fallback target by owner decision;
- Phase 3 remains at Task 14 and database work must not be repeated;
- next action is deploy the cleaned candidate, smoke it, then continue Task 14 owner-auth acceptance.

- [ ] **Step 4: Run full verification**

Expected gate:

```text
pnpm install --frozen-lockfile: PASS
pnpm test: PASS
pnpm typecheck: PASS
pnpm build:kinghost: PASS
```

- [ ] **Step 5: Deploy cleaned candidate to KingHost**

After CI is GREEN:

```bash
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 deploy:kinghost
```

Restart through the panel and verify public HTML/CSS/JS/public asset responses before resuming Phase 3 Task 14.
