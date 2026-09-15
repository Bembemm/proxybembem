import { execFileSync } from "node:child_process"
import { readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const legacyProvider = ["ver", "cel"].join("")
const legacyProviderTitle = `${legacyProvider[0].toUpperCase()}${legacyProvider.slice(1)}`
const legacyEnvironment = `${legacyProvider.toUpperCase()}_ENV`
const legacyAnalyticsPackage = `@${legacyProvider}/analytics`

function indentOf(line) {
  return line.match(/^\s*/)?.[0].length ?? 0
}

function removeYamlBlocks(source, matchesStart, blockIndent) {
  const lines = source.split("\n")
  const output = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!matchesStart(line)) {
      output.push(line)
      continue
    }

    index += 1
    while (index < lines.length) {
      const candidate = lines[index]
      if (candidate.trim() !== "" && indentOf(candidate) <= blockIndent) {
        index -= 1
        break
      }
      index += 1
    }
  }

  return output.join("\n")
}

async function updateFile(filePath, transform) {
  const before = await readFile(filePath, "utf8")
  const after = transform(before)
  if (after !== before) await writeFile(filePath, after, "utf8")
}

async function walkMarkdown(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walkMarkdown(fullPath)))
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(fullPath)
  }
  return files
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function cleanHistoricalText(source) {
  let text = source
  const providerPattern = new RegExp(escapeRegex(legacyProvider), "gi")
  const titlePattern = new RegExp(escapeRegex(legacyProviderTitle), "g")

  text = text.replaceAll(legacyAnalyticsPackage, "legacy analytics package")
  text = text.replaceAll(legacyEnvironment, "HOSTING_ENV")
  text = text.replace(
    new RegExp(`x-${escapeRegex(legacyProvider)}-`, "gi"),
    "x-legacy-provider-",
  )
  text = text.replace(
    new RegExp(`${escapeRegex(legacyProvider)}\\.json`, "gi"),
    "legacy hosting configuration",
  )
  text = text.replace(
    new RegExp(`va\\.${escapeRegex(legacyProvider)}-scripts\\.com`, "gi"),
    "legacy analytics script endpoint",
  )
  text = text.replace(
    new RegExp(`vitals\\.${escapeRegex(legacyProvider)}-insights\\.com`, "gi"),
    "legacy analytics telemetry endpoint",
  )
  text = text.replace(
    new RegExp(`${escapeRegex(legacyProviderTitle)} Analytics`, "g"),
    "legacy analytics integration",
  )
  text = text.replace(
    new RegExp(`${escapeRegex(legacyProviderTitle)} Preview/Production`, "g"),
    "preview/production hosting environments",
  )
  text = text.replace(
    new RegExp(`${escapeRegex(legacyProviderTitle)} Preview`, "g"),
    "preview environment",
  )
  text = text.replace(
    new RegExp(`${escapeRegex(legacyProviderTitle)} Production`, "g"),
    "production environment",
  )
  text = text.replace(
    new RegExp(`${escapeRegex(legacyProviderTitle)}-(?:only|specific)`, "gi"),
    "provider-specific",
  )
  text = text.replace(titlePattern, "previous hosting provider")
  text = text.replace(providerPattern, "previous hosting provider")

  return text
}

async function cleanPackageFiles() {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"))
  if (packageJson.dependencies) delete packageJson.dependencies[legacyAnalyticsPackage]
  await writeFile("package.json", `${JSON.stringify(packageJson, null, 2)}\n`, "utf8")

  await updateFile("pnpm-lock.yaml", (source) => {
    let next = removeYamlBlocks(
      source,
      (line) => line.trim() === `'${legacyAnalyticsPackage}':`,
      6,
    )
    next = removeYamlBlocks(
      next,
      (line) => line.trim().startsWith(`'${legacyAnalyticsPackage}@`),
      2,
    )
    return next
  })
}

async function cleanPrivacyPage() {
  const providerAnalytics = `${legacyProviderTitle} Analytics`
  await updateFile("app/privacidade/page.tsx", (source) =>
    source.replace(
      `                O site pode usar ${providerAnalytics} para receber informações técnicas e de uso, como métricas\n                gerais de acesso e desempenho. Nome, WhatsApp e endereço do pedido não são intencionalmente\n                enviados como eventos de analytics pela ProxyBembem.`,
      "                O site pode registrar informações técnicas e de uso necessárias para segurança, diagnóstico\n                e desempenho. Nome, WhatsApp e endereço do pedido não são intencionalmente enviados como\n                eventos técnicos pela ProxyBembem.",
    ),
  )
}

async function cleanTests() {
  await rm("tests/provider-neutral-runtime.test.ts", { force: true })
  await rm("tests/kinghost-provider-retirement.test.ts", { force: true })

  for (const filePath of [
    "tests/melhor-envio-oauth-callback-origin.test.ts",
    "tests/admin-order-actions.test.ts",
    "tests/melhor-envio-oauth-routes.test.ts",
    "tests/security-headers.test.ts",
  ]) {
    await updateFile(filePath, (source) => {
      const inlineEnvironment = new RegExp(`,\\s*["']${legacyEnvironment}["']`, "g")
      return source
        .replace(inlineEnvironment, "")
        .split("\n")
        .filter((line) => !line.includes(legacyEnvironment))
        .join("\n")
    })
  }

  const cleanlinessTest = `import assert from "node:assert/strict"\nimport { spawnSync } from "node:child_process"\nimport test from "node:test"\n\nconst retiredProvider = ["ver", "cel"].join("")\n\ntest("tracked project files contain no retired hosting-provider references", () => {\n  const grep = spawnSync("git", ["grep", "-I", "-i", "-n", retiredProvider, "--", "."], {\n    encoding: "utf8",\n  })\n\n  assert.equal(grep.status, 1, grep.stdout || grep.stderr)\n})\n`
  await writeFile("tests/hosting-cleanliness.test.ts", cleanlinessTest, "utf8")
}

async function cleanDocumentation() {
  for (const filePath of await walkMarkdown("docs")) {
    await updateFile(filePath, cleanHistoricalText)
  }

  await updateFile("docs/payments-setup.md", (source) =>
    source.replace(
      /O fluxo usa `pnpm deploy:kinghost` e restart do app `proxybembem` pelo painel KingHost\.[^\n]*/,
      "O fluxo usa `pnpm deploy:kinghost` e restart do app `proxybembem` pelo painel KingHost. Siga somente esse runbook e não use procedimentos antigos ou PM2 manual.",
    ),
  )
}

async function verifyNoReferences() {
  let matches = ""
  try {
    matches = execFileSync("git", ["grep", "-I", "-i", "-n", legacyProvider, "--", "."], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    if (error?.status === 1) return
    throw error
  }

  if (matches.trim()) {
    throw new Error(`Retired hosting references remain:\n${matches}`)
  }
}

await cleanPackageFiles()
await cleanPrivacyPage()
await cleanTests()
await cleanDocumentation()
await verifyNoReferences()
