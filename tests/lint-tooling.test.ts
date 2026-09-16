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

test("CI runs lint on the exact KingHost Node runtime before building", async () => {
  const source = await readFile(CI_WORKFLOW, "utf8")
  const typecheck = source.indexOf("pnpm typecheck")
  const lint = source.indexOf("pnpm lint")
  const build = source.indexOf("pnpm build:kinghost")

  assert.ok(typecheck >= 0, "typecheck step missing")
  assert.ok(lint > typecheck, "lint must run after typecheck")
  assert.ok(build > lint, "lint must run before the KingHost build")
})
