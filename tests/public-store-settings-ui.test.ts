import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("root layout loads cached public settings server-side and passes only the projection to SiteShell", async () => {
  const layout = await source("../app/layout.tsx")

  assert.match(layout, /getPublicStoreSettings/)
  assert.match(layout, /store-settings-cache/)
  assert.match(layout, /export\s+default\s+async\s+function\s+RootLayout/)
  assert.match(layout, /const\s+storeSettings\s*=\s*await\s+getPublicStoreSettings\(\)/)
  assert.match(layout, /<SiteShell\s+storeSettings=\{storeSettings\}>/)
  assert.doesNotMatch(layout, /getAdminStoreSettings|SUPABASE_SECRET_KEY|service_role/)
})

test("client storefront shell receives only public settings and imports no server credential layer", async () => {
  const shell = await source("../components/site-shell.tsx")

  assert.match(shell, /^["']use client["']/m)
  assert.match(shell, /PublicStoreSettings/)
  assert.match(shell, /storeSettings/)
  assert.doesNotMatch(shell, /lib\/server|SUPABASE_|service_role|SECRET_KEY|admin_update_store_settings/)
})

test("FAQ receives the production lead time and renders singular or plural dynamically", async () => {
  const faq = await source("../components/faq-section.tsx")
  const shell = await source("../components/site-shell.tsx")

  assert.match(faq, /productionLeadTimeBusinessDays/)
  assert.match(faq, /productionLeadTimeBusinessDays\s*===\s*1/)
  assert.match(faq, /dia útil/)
  assert.match(faq, /dias úteis/)
  assert.doesNotMatch(faq, /produção é de até 5 dias úteis/i)
  assert.match(
    shell,
    /<FaqSection\s+productionLeadTimeBusinessDays=\{storeSettings\.productionLeadTimeBusinessDays\}/,
  )
})

test("footer receives nullable configured contacts and omits unavailable links", async () => {
  const footer = await source("../components/footer.tsx")
  const shell = await source("../components/site-shell.tsx")

  assert.match(footer, /contactEmail/)
  assert.match(footer, /contactWhatsappE164/)
  assert.match(footer, /contactEmail\s*\?/)
  assert.match(footer, /contactWhatsappE164\s*\?/)
  assert.match(footer, /mailto:/)
  assert.match(footer, /wa\.me/)
  assert.doesNotMatch(footer, /5544991250332/)
  assert.doesNotMatch(footer, /contato@proxybembem\.com\.br/i)
  assert.match(shell, /contactEmail=\{storeSettings\.contactEmail\}/)
  assert.match(shell, /contactWhatsappE164=\{storeSettings\.contactWhatsappE164\}/)
})

test("store notice is plain text, conditional, and rendered directly below navbar", async () => {
  const notice = await source("../components/store-notice.tsx")
  const shell = await source("../components/site-shell.tsx")

  assert.ok(notice.length > 0, "missing StoreNotice component")
  assert.match(notice, /noticeEnabled/)
  assert.match(notice, /noticeText/)
  assert.match(notice, /!noticeEnabled\s*\|\|\s*!noticeText/)
  assert.match(notice, /return\s+null/)
  assert.doesNotMatch(notice, /dangerouslySetInnerHTML/)
  assert.doesNotMatch(notice, /innerHTML/)
  assert.match(shell, /<Navbar\s*\/?>[\s\S]*<StoreNotice/)
  const navbar = shell.indexOf("<Navbar")
  const storeNotice = shell.indexOf("<StoreNotice")
  const pageContent = shell.indexOf("{children}", storeNotice)
  assert.ok(
    navbar < storeNotice && storeNotice < pageContent,
    "store notice must sit directly below navbar before page content",
  )
})

test("admin early return prevents every storefront-only settings consumer from rendering", async () => {
  const shell = await source("../components/site-shell.tsx")

  const earlyReturn = shell.indexOf("if (isAdminRoute)")
  const navbar = shell.indexOf("<Navbar")
  const notice = shell.indexOf("<StoreNotice")
  const faq = shell.indexOf("<FaqSection")
  const footer = shell.indexOf("<Footer")
  const cart = shell.indexOf("<CartPanel")

  assert.ok(earlyReturn >= 0)
  assert.ok(navbar > earlyReturn)
  assert.ok(notice > earlyReturn)
  assert.ok(faq > earlyReturn)
  assert.ok(footer > earlyReturn)
  assert.ok(cart > earlyReturn)
  assert.match(shell, /return\s+<>\{children\}<\/>/)
})
