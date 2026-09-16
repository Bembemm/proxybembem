import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

const publicCanonicals = [
  ["app/page.tsx", "/"],
  ["app/produtos/page.tsx", "/produtos"],
  ["app/contato/page.tsx", "/contato"],
  ["app/privacidade/page.tsx", "/privacidade"],
  ["app/termos/page.tsx", "/termos"],
  ["app/trocas-e-reembolsos/page.tsx", "/trocas-e-reembolsos"],
] as const

const noIndexLayouts = [
  "app/admin/layout.tsx",
  "app/minha-conta/layout.tsx",
  "app/checkout/layout.tsx",
  "app/entrar/layout.tsx",
  "app/criar-conta/layout.tsx",
  "app/esqueci-a-senha/layout.tsx",
  "app/redefinir-senha/layout.tsx",
  "app/cadastro-recebido/layout.tsx",
] as const

test("root metadata defines a canonical base, social cards and sandbox-wide noindex", () => {
  const layout = source("app/layout.tsx")

  assert.match(layout, /metadataBase:\s*resolveSeoSiteUrl\(\)/)
  assert.match(layout, /openGraph:\s*\{/)
  assert.match(layout, /siteName:\s*["']ProxyBembem["']/)
  assert.match(layout, /images:\s*\[/)
  assert.match(layout, /["']\/brand\/pb["']/)
  assert.match(layout, /twitter:\s*\{/)
  assert.match(layout, /card:\s*["']summary["']/)
  assert.match(layout, /robots:\s*isSandboxDeployment\(\)/)
})

test("SEO URL resolution uses the configured HTTPS host and the canonical production fallback", () => {
  const seo = source("lib/seo.ts")

  assert.match(seo, /https:\/\/www\.proxybembem\.com\.br/)
  assert.match(seo, /NEXT_PUBLIC_SITE_URL/)
  assert.match(seo, /APP_ENVIRONMENT/)
  assert.match(seo, /sandbox/)
  assert.match(seo, /protocol\s*!==\s*["']https:["']/)
})

test("every indexable public page declares its own canonical path", () => {
  for (const [path, canonical] of publicCanonicals) {
    const page = source(path)
    assert.match(page, /alternates:\s*\{/i, `${path} must define alternates`)
    assert.ok(
      page.includes(`canonical: "${canonical}"`) || page.includes(`canonical: '${canonical}'`),
      `${path} must canonicalize to ${canonical}`,
    )
  }
})

test("private transactional and authentication surfaces publish noindex metadata", () => {
  for (const path of noIndexLayouts) {
    const layout = source(path)
    assert.match(layout, /robots:/, `${path} must define robots metadata`)
    assert.match(layout, /index:\s*false/, `${path} must be noindex`)
    assert.match(layout, /follow:\s*false/, `${path} must be nofollow`)
  }
})

test("production robots allows public crawling, blocks private infrastructure and publishes sitemap", () => {
  const robots = source("app/robots.ts")

  assert.match(robots, /MetadataRoute\.Robots/)
  assert.match(robots, /isSandboxDeployment\(\)/)
  assert.match(robots, /disallow:\s*["']\/["']/)
  for (const path of ["/admin/", "/minha-conta/", "/api/", "/auth/", "/checkout"]) {
    assert.ok(robots.includes(`"${path}"`) || robots.includes(`'${path}'`), `robots must block ${path}`)
  }
  assert.match(robots, /sitemap\.xml/)
})

test("sitemap contains only the approved public canonical routes and is empty in sandbox", () => {
  const sitemap = source("app/sitemap.ts")

  assert.match(sitemap, /MetadataRoute\.Sitemap/)
  assert.match(sitemap, /isSandboxDeployment\(\)/)
  assert.match(sitemap, /return \[\]/)
  for (const [, path] of publicCanonicals) {
    assert.ok(sitemap.includes(`"${path}"`) || sitemap.includes(`'${path}'`), `sitemap must include ${path}`)
  }
  for (const path of ["/admin", "/minha-conta", "/checkout", "/entrar", "/api/"]) {
    assert.ok(!sitemap.includes(`"${path}"`) && !sitemap.includes(`'${path}'`), `sitemap must exclude ${path}`)
  }
})
