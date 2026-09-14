import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("admin shell uses a persistent sticky desktop sidebar instead of the old top navigation", async () => {
  const shell = await source("../components/admin/admin-shell.tsx")

  assert.ok(shell.length > 0, "missing shared admin shell")
  assert.doesNotMatch(shell, /^["']use client["']/m)
  assert.match(shell, /<aside\b/)
  assert.match(shell, /hidden[^"']*lg:(?:block|flex)/)
  assert.match(shell, /sticky[^"']*top-/)
  assert.match(shell, /lg:grid-cols-\[/)
  assert.match(shell, /<AdminNav\s+activeSection=\{activeSection\}/)
  assert.match(shell, /<AdminMobileNav\s+activeSection=\{activeSection\}/)
  assert.doesNotMatch(shell, /lg:flex-row\s+lg:items-center\s+lg:justify-between/)
})

test("desktop admin navigation keeps the approved destinations and violet active semantics", async () => {
  const nav = await source("../components/admin/admin-nav.tsx")

  assert.ok(nav.length > 0, "missing shared admin navigation")
  assert.doesNotMatch(nav, /^["']use client["']/m)

  for (const [label, href] of [
    ["Visão geral", "/admin"],
    ["Pedidos", "/admin/pedidos"],
    ["Produção", "/admin/producao"],
    ["Produtos", "/admin/produtos"],
    ["Configurações", "/admin/configuracoes"],
    ["Integrações", "/admin/integrations/melhor-envio"],
  ] as const) {
    assert.match(nav, new RegExp(label))
    assert.match(nav, new RegExp(`href:\\s*["']${href.replaceAll("/", "\\/")}["']`))
  }

  assert.match(nav, /["']settings["']/)
  assert.match(nav, /aria-current=\{active\s*\?\s*["']page["']/)
  assert.match(nav, /bg-violet-600/)
  assert.match(nav, /grid/)
  assert.doesNotMatch(nav, /flex-wrap/)
})

test("mobile admin navigation is a dismissible Radix drawer with the same nav and POST logout", async () => {
  const mobile = await source("../components/admin/admin-mobile-nav.tsx")

  assert.ok(mobile.length > 0, "missing mobile admin navigation")
  assert.match(mobile, /^["']use client["']/m)
  assert.match(mobile, /from\s+["']\.\.\/ui\/dialog["']/)
  assert.match(mobile, /DialogTrigger/)
  assert.match(mobile, /DialogContent/)
  assert.match(mobile, /DialogTitle/)
  assert.match(mobile, /DialogClose/)
  assert.match(mobile, /Menu/)
  assert.match(mobile, /lg:hidden/)
  assert.match(mobile, /<AdminNav\s+activeSection=\{activeSection\}/)
  assert.match(mobile, /method=["']post["']/i)
  assert.match(mobile, /action=["']\/api\/admin\/logout["']/)
  assert.match(mobile, />\s*Sair\s*</)
  assert.match(mobile, /Fechar menu|Fechar navegação|Fechar navegacao/i)
})

test("desktop sidebar keeps logout at the protected shell boundary", async () => {
  const shell = await source("../components/admin/admin-shell.tsx")

  assert.match(shell, /method=["']post["']/i)
  assert.match(shell, /action=["']\/api\/admin\/logout["']/)
  assert.match(shell, />\s*Sair\s*</)
  assert.doesNotMatch(shell, /fetch\s*\(\s*["']\/api\/admin\/logout/)
})
