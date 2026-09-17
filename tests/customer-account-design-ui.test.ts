import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

function requireSource(value: string, label: string) {
  assert.ok(value.length > 0, `missing ${label}`)
}

test("customer account uses an admin-like responsive shell without importing admin boundaries", async () => {
  const shell = await source("../components/account/account-shell.tsx")
  const nav = await source("../components/account/account-nav.tsx")

  requireSource(shell, "customer account shell")
  requireSource(nav, "customer account navigation")

  assert.match(shell, /max-w-7xl/)
  assert.match(shell, /lg:grid-cols-\[16rem_minmax\(0,1fr\)\]/)
  assert.match(shell, /sticky top-/)
  assert.match(shell, /ProxyBembem/)
  assert.match(shell, /Minha conta/)
  assert.match(shell, /lg:hidden/)
  assert.match(shell, /bg-slate-100/)

  assert.match(nav, /usePathname/)
  assert.match(nav, /aria-current/)
  assert.match(nav, /Visão geral/)
  assert.match(nav, /Pedidos/)
  assert.match(nav, /Perfil/)
  assert.match(nav, /Segurança/)
  assert.match(nav, /lucide-react/)

  for (const value of [shell, nav]) {
    assert.doesNotMatch(value, /components\/admin|AdminShell|requireAdminPageAccess/)
  }
})

test("all protected account pages use the shared account page header", async () => {
  const frame = await source("../components/account/account-page.tsx")
  const pages = await Promise.all([
    source("../app/minha-conta/page.tsx"),
    source("../app/minha-conta/pedidos/page.tsx"),
    source("../app/minha-conta/pedidos/[id]/page.tsx"),
    source("../app/minha-conta/perfil/page.tsx"),
    source("../app/minha-conta/seguranca/page.tsx"),
  ])

  requireSource(frame, "shared account page frame")
  assert.match(frame, /Minha conta/)
  assert.match(frame, /rounded-2xl/)
  assert.match(frame, /border-slate-200/)
  assert.match(frame, /text-2xl/)
  assert.match(frame, /sm:text-3xl/)

  for (const page of pages) {
    requireSource(page, "protected account page")
    assert.match(page, /AccountPage/)
    assert.doesNotMatch(page, /components\/admin|AdminShell/)
  }
})
