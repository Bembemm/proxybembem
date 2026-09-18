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

test("server storefront shell receives only public settings while route switching stays in a tiny client boundary", async () => {
  const shell = await source("../components/site-shell.tsx")
  const router = await source("../components/site-shell-router.tsx")

  assert.doesNotMatch(shell, /^["']use client["']/m)
  assert.match(router, /^["']use client["']/m)
  assert.match(shell, /PublicStoreSettings/)
  assert.match(shell, /storeSettings/)
  assert.doesNotMatch(shell, /lib\/server|SUPABASE_|service_role|SECRET_KEY|admin_update_store_settings/)
  assert.doesNotMatch(router, /lib\/server|SUPABASE_|service_role|SECRET_KEY|admin_update_store_settings/)
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

test("store notice is plain text, conditional, and follows the sticky storefront header in normal flow", async () => {
  const notice = await source("../components/store-notice.tsx")
  const shell = await source("../components/site-shell.tsx")
  const navbarSource = await source("../components/navbar.tsx")

  assert.ok(notice.length > 0, "missing StoreNotice component")
  assert.match(notice, /noticeEnabled/)
  assert.match(notice, /noticeText/)
  assert.match(notice, /!noticeEnabled\s*\|\|\s*!noticeText/)
  assert.match(notice, /return\s+null/)
  assert.doesNotMatch(notice, /dangerouslySetInnerHTML/)
  assert.doesNotMatch(notice, /innerHTML/)
  assert.match(navbarSource, /sticky[^"']*top-0/)
  assert.match(navbarSource, /\bh-16\b/)
  assert.match(navbarSource, /lg:h-\[72px\]/)
  assert.doesNotMatch(notice, /\btop-16\b/)
  assert.doesNotMatch(notice, /\bmd:top-24\b/)
  assert.match(notice, /max-w-\[1180px\]/)
  assert.match(shell, /<Navbar\s*\/?>[\s\S]*<StoreNotice/)
  const navbar = shell.indexOf("<Navbar")
  const storeNotice = shell.indexOf("<StoreNotice")
  const pageContent = shell.indexOf("{children}", storeNotice)
  assert.ok(
    navbar < storeNotice && storeNotice < pageContent,
    "store notice must sit directly below navbar before page content",
  )
})

test("admin early return in the client router prevents storefront chrome from mounting", async () => {
  const shell = await source("../components/site-shell.tsx")
  const router = await source("../components/site-shell-router.tsx")

  assert.match(shell, /<Navbar/)
  assert.match(shell, /<StoreNotice/)
  assert.match(shell, /<FaqSection/)
  assert.match(shell, /<Footer/)
  assert.match(shell, /<SiteShellRouter/)

  const earlyReturn = router.indexOf("if (isAdminRoute)")
  const cartProvider = router.indexOf("<CartProvider>", earlyReturn)
  const lazyCart = router.indexOf("<LazyCartPanel", earlyReturn)

  assert.ok(earlyReturn >= 0)
  assert.ok(cartProvider > earlyReturn)
  assert.ok(lazyCart > earlyReturn)
  assert.match(router, /if \(isAdminRoute\) return <>{children}<\/>/)
})

test("successful admin settings save refreshes the App Router projection", async () => {
  const adminSettingsForm = await source("../components/admin/settings/store-settings-form.tsx")

  assert.match(adminSettingsForm, /from\s+["']next\/navigation["']/)
  assert.match(adminSettingsForm, /useRouter/)
  assert.match(adminSettingsForm, /const\s+router\s*=\s*useRouter\(\)/)
  assert.match(adminSettingsForm, /setDirty\(false\)[\s\S]*router\.refresh\(\)/)
})

test("public policy pages read the configured support email instead of embedding one", async () => {
  const privacyPage = await source("../app/privacidade/page.tsx")
  const refundsPage = await source("../app/trocas-e-reembolsos/page.tsx")

  for (const page of [privacyPage, refundsPage]) {
    assert.match(page, /getPublicStoreSettings/)
    assert.match(page, /await\s+getPublicStoreSettings\(\)/)
    assert.match(page, /contactEmail/)
    assert.match(page, /mailto:\$\{contactEmail\}/)
    assert.doesNotMatch(page, /mailto:contato@proxybembem\.com\.br/i)
    assert.doesNotMatch(page, />\s*contato@proxybembem\.com\.br\s*</i)
  }
})

test("individual product page receives the global production lead time and overrides every lead-time presentation", async () => {
  const productRoute = await source("../app/produtos/[produto]/page.tsx")
  const productPage = await source("../components/product-page.tsx")

  assert.match(productRoute, /getPublicStoreSettings/)
  assert.match(productRoute, /productionLeadTimeBusinessDays/)
  assert.match(
    productRoute,
    /<ProductPage[\s\S]*productionLeadTimeBusinessDays=\{storeSettings\.productionLeadTimeBusinessDays\}/,
  )

  assert.match(productPage, /productionLeadTimeBusinessDays:\s*number/)
  assert.match(productPage, /productionLeadTimeBusinessDays\s*===\s*1/)
  assert.match(productPage, /PRODUCTION_LEAD_TIME_HIGHLIGHT/)
  assert.match(productPage, /displayHighlights/)
  assert.match(productPage, /"Produção em até "\s*\+\s*productionLeadTime/)
  assert.match(productPage, /section\.title\.trim\(\)\.toUpperCase\(\)\s*===\s*["']PRAZO["']/)
  assert.match(productPage, /"Produção e postagem em até "\s*\+\s*productionLeadTime/)
})
