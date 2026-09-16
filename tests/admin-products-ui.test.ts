import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("products navigation joins the existing protected admin shell", async () => {
  const nav = await source("../components/admin/admin-nav.tsx")

  assert.ok(nav.length > 0, "missing shared admin navigation")
  assert.match(nav, /\|\s*["']products["']/)
  assert.match(nav, /section:\s*["']products["']/)
  assert.match(nav, /label:\s*["']Produtos["']/)
  assert.match(nav, /href:\s*["']\/admin\/produtos["']/)
  assert.match(nav, /bg-violet-600/)
})

test("admin products page authorizes before catalog reads and bounds URL filters", async () => {
  const page = await source("../app/admin/produtos/page.tsx")

  assert.ok(page.length > 0, "missing /admin/produtos page")
  assert.doesNotMatch(page, /^["']use client["']/m)
  assert.match(page, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(page, /requireAdminPageAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(page, /await\s+searchParams/)
  assert.match(page, /listAdminProducts\s*\(/)
  assert.match(page, /activeSection=["']products["']/)
  assert.ok(
    page.indexOf("requireAdminPageAccess") < page.indexOf("listAdminProducts"),
    "admin authorization must happen before product catalog reads",
  )

  assert.match(page, /\.q\b|\[\s*["']q["']\s*\]/)
  assert.match(page, /\.status\b|\[\s*["']status["']\s*\]/)
  assert.match(page, /\.page\b|\[\s*["']page["']\s*\]/)
  assert.match(page, /slice\(\s*0\s*,\s*100\s*\)|maxLength=\{100\}/)
  assert.match(page, /isProductStatus/)
  assert.match(page, /Number\.isSafeInteger|Number\.parseInt/)
  assert.match(page, /const\s+PAGE_SIZE\s*=\s*25/)
  assert.match(page, /pageSize:\s*PAGE_SIZE/)
})

test("admin product list renders the approved operational fields and actions", async () => {
  const page = await source("../app/admin/produtos/page.tsx")
  const list = await source("../components/admin/products/product-list.tsx")

  assert.ok(page.length > 0, "missing /admin/produtos page")
  assert.ok(list.length > 0, "missing admin product list component")
  assert.match(page, /Novo produto/)
  assert.match(page, /href=[{]?["'`]\/admin\/produtos\/novo/)
  assert.match(page, /Buscar/)

  for (const label of ["Todos", "Rascunho", "Publicado", "Arquivado"]) {
    assert.match(page, new RegExp(label))
  }

  for (const field of [
    "product.image",
    "product.title",
    "product.status",
    "product.discountPrice",
    "product.category",
    "product.featured",
    "product.updatedAt",
  ]) {
    assert.match(list, new RegExp(field.replace(".", "\\.")))
  }

  for (const label of ["Produto", "Status", "Preço", "Categoria", "Destaque", "Atualizado", "Editar"]) {
    assert.match(list, new RegExp(label))
  }
  assert.match(list, /\/admin\/produtos\/\$\{product\.id\}/)
})

test("admin product list is explicitly usable on mobile and paginates server-side", async () => {
  const page = await source("../app/admin/produtos/page.tsx")
  const list = await source("../components/admin/products/product-list.tsx")

  assert.ok(list.length > 0, "missing admin product list component")
  assert.match(list, /md:hidden|sm:hidden/)
  assert.match(list, /hidden\s+md:|hidden\s+sm:/)
  assert.match(list, /article|role=["']listitem["']/)
  assert.match(page, /URLSearchParams/)
  assert.match(page, /set\(\s*["']page["']/)
  assert.match(page, /Anterior/)
  assert.match(page, /Próxima|Proxima/)
  assert.match(page, /Math\.ceil\s*\(/)
  assert.doesNotMatch(page, /createBrowserClient|createClientComponentClient/)
  assert.doesNotMatch(page, /pageSize:\s*(?:51|[6-9]\d|\d{3,})/)
})
