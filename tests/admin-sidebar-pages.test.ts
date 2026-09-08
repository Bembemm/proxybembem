import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const ROUTES = [
  ["../app/admin/page.tsx", "overview"],
  ["../app/admin/pedidos/page.tsx", "orders"],
  ["../app/admin/pedidos/[id]/page.tsx", "orders"],
  ["../app/admin/producao/page.tsx", "production"],
  ["../app/admin/integrations/melhor-envio/page.tsx", "integrations"],
  ["../app/admin/produtos/page.tsx", "products"],
  ["../app/admin/produtos/[id]/page.tsx", "products"],
  ["../app/admin/produtos/novo/page.tsx", "products"],
] as const

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("every protected operational page keeps page auth and the shared sidebar shell section", async () => {
  for (const [path, section] of ROUTES) {
    const text = await source(path)
    const authIndex = text.indexOf("requireAdminPageAccess({ touch: true })")
    const shellIndex = text.indexOf("<AdminShell")

    assert.ok(authIndex >= 0, `${path} must keep the protected page authorization gate`)
    assert.ok(shellIndex > authIndex, `${path} must authorize before rendering the admin shell`)
    assert.match(text, new RegExp(`activeSection=["']${section}["']`), `${path} has the wrong active section`)
    assert.doesNotMatch(text, /AdminNav|AdminMobileNav/, `${path} must consume navigation only through AdminShell`)
  }
})

test("overview and integrations fit inside the sidebar content region on narrow screens", async () => {
  const overview = await source("../app/admin/page.tsx")
  const integration = await source("../app/admin/integrations/melhor-envio/page.tsx")

  assert.match(overview, /className=["'][^"']*min-w-0[^"']*space-y-/)
  assert.match(integration, /className=["'][^"']*min-w-0[^"']*w-full[^"']*max-w-xl/)
  assert.match(integration, /className=["'][^"']*w-full[^"']*sm:w-auto/)
})

test("orders preserve their responsive operational content under the shared sidebar", async () => {
  const list = await source("../app/admin/pedidos/page.tsx")
  const detail = await source("../app/admin/pedidos/[id]/page.tsx")

  assert.match(list, /grid gap-3 sm:grid-cols-2 lg:grid-cols-4/)
  assert.match(list, /md:grid-cols-\[minmax\(0,1\.3fr\)_minmax\(0,1fr\)_auto\]/)
  assert.match(list, /Paginação dos pedidos/)
  assert.match(detail, /sm:grid-cols-2 lg:grid-cols-4/)
  assert.match(detail, /grid gap-5 lg:grid-cols-2/)
  assert.match(detail, /Ações operacionais/)
})

test("production and product management stay width-safe inside the persistent sidebar", async () => {
  const production = await source("../app/admin/producao/page.tsx")
  const products = await source("../app/admin/produtos/page.tsx")
  const editProduct = await source("../app/admin/produtos/[id]/page.tsx")
  const newProduct = await source("../app/admin/produtos/novo/page.tsx")

  assert.match(production, /className=["']min-w-0 grid gap-4 xl:grid-cols-3["']/)

  assert.match(products, /className=["']min-w-0 space-y-6["']/)
  assert.match(products, /sm:grid-cols-2 xl:grid-cols-\[minmax\(0,1fr\)_220px_auto\]/)
  assert.doesNotMatch(products, /sm:grid-cols-\[minmax\(0,1fr\)_220px_auto\]/)
  assert.match(products, /className=["'][^"']*w-full[^"']*sm:w-auto[^"']*bg-violet-600/)

  assert.match(editProduct, /className=["']min-w-0 space-y-5["']/)
  assert.match(newProduct, /className=["']min-w-0 space-y-5["']/)
})
