import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const PACKAGE_JSON = new URL("../package.json", import.meta.url)
const ESLINT_CONFIG = new URL("../eslint.config.mjs", import.meta.url)
const CI_WORKFLOW = new URL("../.github/workflows/ci.yml", import.meta.url)

test("lint script uses ESLint 9 instead of duplicating typecheck", async () => {
  const pkg = JSON.parse(await readFile(PACKAGE_JSON, "utf8")) as {
    scripts?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  assert.equal(pkg.scripts?.lint, "eslint . --max-warnings=0")
  assert.notEqual(pkg.scripts?.lint, pkg.scripts?.typecheck)
  assert.equal(pkg.devDependencies?.eslint, "9.39.5")
  assert.equal(pkg.devDependencies?.["eslint-config-next"], "16.3.3")
})

test("flat config enables Next core web vitals and TypeScript rules", async () => {
  const source = await readFile(ESLINT_CONFIG, "utf8")

  assert.match(source, /from\s+["']eslint\/config["']/)
  assert.match(source, /eslint-config-next\/core-web-vitals/)
  assert.match(source, /eslint-config-next\/typescript/)
  assert.match(source, /\.\.\.nextVitals/)
  assert.match(source, /\.\.\.nextTs/)
  assert.match(source, /\.next\/\*\*/)
  assert.match(source, /next-env\.d\.ts/)
})

test("CI runs lint then typecheck on the exact KingHost Node runtime before building", async () => {
  const source = await readFile(CI_WORKFLOW, "utf8")
  const lint = source.indexOf("pnpm lint")
  const typecheck = source.indexOf("pnpm typecheck")
  const build = source.indexOf("pnpm build:kinghost")

  assert.ok(lint >= 0, "lint step missing")
  assert.ok(typecheck > lint, "typecheck must run after lint")
  assert.ok(build > typecheck, "KingHost build must run after typecheck")
})

test("CI runs the explicit critical commerce and security subset before the full suite", async () => {
  const source = await readFile(CI_WORKFLOW, "utf8")
  const subset = source.indexOf("Critical commerce and security subset")
  const fullSuite = source.indexOf("pnpm test")

  assert.ok(subset >= 0, "critical subset step missing")
  assert.ok(fullSuite > subset, "full suite must run after the critical subset")
  for (const path of [
    "tests/checkout-flow.test.ts",
    "tests/mercadopago-preference.test.ts",
    "tests/webhook-signature.test.ts",
    "tests/melhor-envio-oauth-routes.test.ts",
    "tests/private-order-only.test.ts",
    "tests/phase9-route-security.test.ts",
    "tests/phase9-supabase-hardening.test.ts",
  ]) {
    assert.ok(source.includes(path), `critical subset missing ${path}`)
  }
})
