import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("new and edit product pages protect access before rendering or catalog reads", async () => {
  const createPage = await source("../app/admin/produtos/novo/page.tsx")
  const editPage = await source("../app/admin/produtos/[id]/page.tsx")

  assert.ok(createPage.length > 0, "missing new product page")
  assert.ok(editPage.length > 0, "missing edit product page")
  assert.match(createPage, /requireAdminPageAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(editPage, /requireAdminPageAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(createPage, /activeSection=["']products["']/)
  assert.match(editPage, /activeSection=["']products["']/)
  assert.match(createPage, /ProductForm/)
  assert.match(editPage, /getAdminProduct\s*\(/)
  assert.match(editPage, /ProductForm/)
  assert.ok(
    editPage.indexOf("requireAdminPageAccess") < editPage.indexOf("getAdminProduct"),
    "edit page must authorize before product lookup",
  )
})

test("product form exposes explicit editor sections and never autosaves", async () => {
  const form = await source("../components/admin/products/product-form.tsx")

  assert.ok(form.length > 0, "missing product form")
  assert.match(form, /^["']use client["']/m)
  for (const label of [
    "Informações básicas",
    "Preços",
    "Imagem",
    "Descrição e conteúdo",
    "Frete e dimensões",
    "Publicação",
    "Salvar alterações",
  ]) {
    assert.match(form, new RegExp(label))
  }
  assert.match(form, /onSubmit=/)
  assert.doesNotMatch(form, /setInterval\s*\(/)
  assert.doesNotMatch(form, /autosave|autoSave|auto-save/i)
})

test("currency fields are Brazilian-facing and submit integer cents", async () => {
  const form = await source("../components/admin/products/product-form.tsx")

  assert.match(form, /pt-BR/)
  assert.match(form, /originalPriceCents/)
  assert.match(form, /priceCents/)
  assert.match(form, /Math\.round\s*\(/)
  assert.match(form, /replace\s*\(/)
  assert.doesNotMatch(form, /type=["']number["'][^>]*name=["'](?:originalPriceCents|priceCents)["']/)
})

test("highlights details and sections use repeatable controls rather than raw JSON textareas", async () => {
  const repeatable = await source("../components/admin/products/repeatable-fields.tsx")
  const form = await source("../components/admin/products/product-form.tsx")

  assert.ok(repeatable.length > 0, "missing repeatable product fields")
  assert.match(repeatable, /Adicionar destaque/)
  assert.match(repeatable, /Adicionar detalhe/)
  assert.match(repeatable, /Adicionar seção/)
  assert.match(repeatable, /Remover/)
  assert.match(repeatable, /Mover para cima/)
  assert.match(repeatable, /Mover para baixo/)
  assert.doesNotMatch(repeatable, /JSON\.parse|JSON\.stringify/)
  assert.doesNotMatch(form, /textarea[^>]+name=["'][^"']*(highlights|details|sections)/i)
})

test("shipping stays collapsed by default with the existing Radix accordion", async () => {
  const form = await source("../components/admin/products/product-form.tsx")

  assert.match(form, /from\s+["'][^"']*ui\/accordion["']/)
  assert.match(form, /<Accordion/)
  assert.match(form, /Frete e dimensões/)
  assert.doesNotMatch(form, /defaultValue=["']shipping["']/)
})

test("image field authorizes metadata then uploads bytes directly to Supabase Storage", async () => {
  const imageField = await source("../components/admin/products/product-image-field.tsx")

  assert.ok(imageField.length > 0, "missing product image field")
  assert.match(imageField, /\/api\/admin\/products\/image-upload/)
  assert.match(imageField, /originalFilename/)
  assert.match(imageField, /mimeType/)
  assert.match(imageField, /byteSize/)
  assert.match(imageField, /8\s*\*\s*1024\s*\*\s*1024|8_388_608/)
  assert.match(imageField, /image\/jpeg/)
  assert.match(imageField, /image\/png/)
  assert.match(imageField, /image\/webp/)
  assert.match(imageField, /createAdminSupabaseBrowserClient/)
  assert.match(imageField, /uploadToSignedUrl/)
  assert.match(imageField, /product-images/)
  assert.match(imageField, /upsert:\s*false/)
  assert.doesNotMatch(imageField, /SUPABASE_SECRET_KEY|supabaseSecretKey/)
})

test("editor keeps optimistic revision, warns on unsaved changes and handles conflicts without retry", async () => {
  const form = await source("../components/admin/products/product-form.tsx")

  assert.match(form, /expectedUpdatedAt/)
  assert.match(form, /beforeunload/)
  assert.match(form, /Este produto foi alterado em outra sessão\. Recarregue antes de salvar\./)
  assert.match(form, /product_conflict/)
  assert.doesNotMatch(form, /retry\s*\(|setTimeout\s*\([^)]*submit|while\s*\([^)]*product_conflict/i)
})

test("lifecycle actions are explicit and archive requires a confirmation dialog", async () => {
  const actions = await source("../components/admin/products/product-lifecycle-actions.tsx")

  assert.ok(actions.length > 0, "missing product lifecycle actions")
  for (const label of ["Publicar", "Arquivar", "Reativar"]) {
    assert.match(actions, new RegExp(label))
  }
  assert.match(actions, /\/publish/)
  assert.match(actions, /\/archive/)
  assert.match(actions, /\/reactivate/)
  assert.match(actions, /expectedUpdatedAt/)
  assert.match(actions, /Dialog/)
  assert.match(actions, /Confirmar arquivamento|Arquivar produto/)
  assert.match(actions, /product_conflict/)
  assert.match(actions, /draft/)
  assert.doesNotMatch(actions, /method:\s*["']DELETE["']/)
})
