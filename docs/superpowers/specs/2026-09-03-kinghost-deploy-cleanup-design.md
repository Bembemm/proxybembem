# KingHost Deployment Cleanup Design

**Date:** 2026-09-03
**Branch:** `feat/admin-dashboard-expansion`

## Goal

Make KingHost the only application runtime target and turn the proven manual deployment steps into a small, repeatable deployment interface without restructuring application code.

## Confirmed hosting behavior

Production evidence on `proxybembem.com.br` established two serving paths:

- dynamic pages/API requests are proxied by KingHost Nginx to the Next.js standalone process on the assigned high port;
- browser static assets are served by KingHost from `~/www` before the Node process is consulted.

The same CSS, JavaScript and `public/placeholder-logo.png` returned `200` when requested directly from the Node port and `404` through the public domain until they were copied to `~/www`. After copying `public/` to `~/www/` and `.next/static/` to `~/www/_next/static/`, public CSS and JavaScript returned `200` with the correct MIME types and the storefront rendered normally.

## Target structure

Keep application code where it is. Only deployment infrastructure is reorganized:

```text
app.js                              # KingHost panel entrypoint; remains at repo root
scripts/kinghost/
  prepare-standalone.mjs            # packages Next standalone runtime
  publish-assets.mjs                # publishes browser assets to KingHost webroot

docs/deployment/kinghost.md         # canonical operator runbook
```

`app/`, `components/`, `lib/`, `supabase/` and product/business behavior are outside this cleanup.

## Runtime contract

- KingHost runtime is Node.js `22.1.0`.
- `.nvmrc` and CI use the same runtime.
- `app.js` continues to resolve the KingHost-provided application port and bind the standalone server to `0.0.0.0`.
- The application web path remains `/`.
- No hard-coded allocated port is committed.

## Build and deployment commands

`pnpm build:kinghost` remains CI-safe and writes only inside the checkout:

1. build Next.js using webpack;
2. package `.next/standalone/public`;
3. package `.next/standalone/.next/static`.

`pnpm deploy:kinghost` is the server deployment command:

1. run `build:kinghost`;
2. publish `public/` contents into the KingHost webroot;
3. publish `.next/static/` contents into `<webroot>/_next/static/`.

The default webroot is `$HOME/www`. `KINGHOST_WEB_ROOT` and `KINGHOST_PROJECT_ROOT` may override paths for tests/diagnostics; they are not secrets.

## Asset publication safety

The publisher must validate both source directories before writing anything. It may create missing destination directories and overwrite same-name project assets, but it must never remove or recreate the whole KingHost webroot.

Publication is merge/copy-only. Existing unrelated files in `~/www` are preserved, and previous hashed `/_next/static` assets are allowed to remain. Keeping previous immutable hashes avoids a deployment window where the currently running Next process references assets that have already been deleted before the panel restart.

## previous hosting provider retirement

KingHost is now the selected runtime. Remove active provider-specific runtime/config behavior:

- delete `legacy hosting configuration`;
- production HSTS derives only from `NODE_ENV=production`, not `HOSTING_ENV`;
- current operational docs no longer instruct waiting for or falling back to previous hosting provider.

Historical planning documents may retain previous hosting provider references as historical context. The already-unused `legacy analytics package` package entry is dependency-only and has no runtime integration; lockfile/package removal is deferred unless it can be regenerated and verified atomically with `pnpm install --frozen-lockfile` preserved.

## CI

Use one Node.js `22.1.0` runtime for install, tests, typecheck and `build:kinghost`. CI must not invoke `deploy:kinghost` because CI must never write to a hosting webroot.

## Acceptance

The cleanup is accepted when:

- deployment publisher tests prove `public/` and `.next/static/` reach an isolated fake webroot while unrelated files survive;
- existing tests/typecheck/build pass on Node `22.1.0`;
- `build:kinghost` still creates the standalone package;
- `deploy:kinghost` is documented as the only manual server deploy command before panel restart;
- previous hosting provider active configuration is removed;
- after pulling the candidate on KingHost, one deployment keeps `/`, one `public/` asset, one CSS asset and one JS asset publicly healthy.

## Non-goals

- no application feature refactor;
- no Supabase migration or data change;
- no checkout/payment/auth behavior redesign;
- no change to the KingHost assigned port mechanism;
- no deletion of arbitrary files from `~/www`.
