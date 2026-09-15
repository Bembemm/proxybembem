import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

const CLIENT_FILES = [
  "../app/admin/login/login-form.tsx",
  "../app/admin/setup-mfa/setup-mfa-form.tsx",
  "../app/admin/mfa/mfa-form.tsx",
  "../components/admin/admin-mobile-nav.tsx",
] as const

const FORBIDDEN_CLIENT_SECRETS =
  /ADMIN_USER_ID|SUPABASE_SECRET_KEY|service_role|MELHOR_ENVIO_|localStorage/

function assertMappedStatus(text: string, status: number) {
  assert.match(
    text,
    new RegExp(`(?:response\\(\\s*${status}\\s*(?:,|\\))|status:\\s*${status})`),
  )
}

test("password login exposes no signup or recovery bypass", async () => {
  const form = await source("../app/admin/login/login-form.tsx")
  const page = await source("../app/admin/login/page.tsx")

  assert.match(form, /type=["']email["']/)
  assert.match(form, /type=["']password["']/)
  assert.match(form, /autoComplete=["']username["']/)
  assert.match(form, /autoComplete=["']current-password["']/)
  assert.match(form, /signInWithPassword/)
  assert.match(form, /\/admin\/mfa/)
  assert.doesNotMatch(form, /signUp|signup|Cadastrar|Criar conta|resetPassword|Esqueci/i)

  assert.match(page, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(page, /authorizeAdminAccess/)
  assert.match(page, /touch:\s*false/)
})

test("normal MFA uses only verified TOTP challenge then server activation", async () => {
  const page = await source("../app/admin/mfa/page.tsx")
  const form = await source("../app/admin/mfa/mfa-form.tsx")

  assert.match(page, /getClaims\s*\(/)
  assert.match(page, /listFactors\s*\(/)
  assert.match(page, /verified/)
  assert.match(page, /\/admin\/setup-mfa/)
  assert.match(form, /challenge\s*\(/)
  assert.match(form, /verify\s*\(/)
  assert.match(form, /\/api\/admin\/session\/activate/)
  assert.match(form, /\^\\d\{6\}\$/)
  assert.match(form, /response\.status\s*!==\s*204/)
})

test("first setup enrolls authenticator TOTP only after explicit user action", async () => {
  const page = await source("../app/admin/setup-mfa/page.tsx")
  const form = await source("../app/admin/setup-mfa/setup-mfa-form.tsx")

  assert.match(page, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(form, /factorType:\s*["']totp["']/)
  assert.match(form, /friendlyName:\s*["']ProxyBembem Admin["']/)
  assert.match(form, /qr_code/)
  assert.match(form, /<img/)
  assert.match(form, /challenge\s*\(/)
  assert.match(form, /verify\s*\(/)
  assert.match(form, /\/api\/admin\/session\/activate/)
  assert.match(form, /\^\\d\{6\}\$/)
  assert.doesNotMatch(form, /useEffect\s*\([^)]*enroll|phone|sms|trusted device|lembrar/i)
})

test("admin auth client components contain no server secrets or persistence bypass", async () => {
  for (const path of CLIENT_FILES) {
    const text = await source(path)
    assert.ok(text.length > 0, `missing ${path}`)
    assert.doesNotMatch(text, FORBIDDEN_CLIENT_SECRETS, `${path} exposes forbidden material`)
    assert.doesNotMatch(text, /console\.(?:log|error|warn)\s*\(/, `${path} must not log auth material`)
  }
})

test("activation and logout are POST-only same-origin no-store server routes", async () => {
  const activate = await source("../app/api/admin/session/activate/route.ts")
  const logout = await source("../app/api/admin/logout/route.ts")

  assert.match(activate, /export\s+async\s+function\s+POST|export\s+const\s+POST/)
  assert.match(activate, /resolvePublicSiteUrl/)
  assert.match(activate, /isAllowedCheckoutOrigin/)
  assert.match(activate, /activateCurrentAdminSession/)
  assertMappedStatus(activate, 204)
  assertMappedStatus(activate, 503)
  assertMappedStatus(activate, 403)
  assertMappedStatus(activate, 401)
  assert.match(activate, /Cache-Control["']?\s*[,\]:].*no-store/i)

  assert.match(logout, /export\s+async\s+function\s+POST|export\s+const\s+POST/)
  assert.match(logout, /resolvePublicSiteUrl/)
  assert.match(logout, /isAllowedCheckoutOrigin/)
  assert.match(logout, /revokeCurrentAdminSession/)
  assertMappedStatus(logout, 303)
  assert.match(logout, /\/admin\/login/)
  assert.match(logout, /private,\s*no-store/i)
})

test("only meaningful protected admin interactions refresh inactivity", async () => {
  const adminPage = await source("../app/admin/page.tsx")
  const integrationPage = await source("../app/admin/integrations/melhor-envio/page.tsx")
  const oauthStart = await source("../app/api/internal/melhor-envio/oauth/start/route.ts")
  const loginPage = await source("../app/admin/login/page.tsx")
  const rootProxy = await source("../proxy.ts")

  assert.match(adminPage, /requireAdminPageAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(
    integrationPage,
    /requireAdminPageAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/,
  )
  assert.match(oauthStart, /authorizeAdminAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)

  assert.match(loginPage, /authorizeAdminAccess\s*\(\s*\{\s*touch:\s*false\s*\}\s*\)/)
  assert.doesNotMatch(rootProxy, /authorizeAdminAccess|requireAdminPageAccess|touch:\s*true/)
})

test("CSP permits browser auth only to the configured Supabase origin", async () => {
  const config = await source("../next.config.mjs")

  assert.match(config, /NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(config, /supabase(?:Browser|Auth)Origin/)
  assert.match(config, /connect-src[^\n]*supabase(?:Browser|Auth)Origin/)
  assert.doesNotMatch(config, /\*\.supabase\.co/)
})

test("admin routes use a dedicated protected shell instead of storefront chrome", async () => {
  const rootLayout = await source("../app/layout.tsx")
  const siteShell = await source("../components/site-shell.tsx")
  const adminPage = await source("../app/admin/page.tsx")
  const adminShell = await source("../components/admin/admin-shell.tsx")
  const adminNav = await source("../components/admin/admin-nav.tsx")
  const adminMobileNav = await source("../components/admin/admin-mobile-nav.tsx")

  assert.match(rootLayout, /SiteShell/)
  assert.doesNotMatch(rootLayout, /FaqSection|WhatsAppFloatingButton|CartPanel|Navbar/)

  assert.match(siteShell, /usePathname/)
  assert.match(siteShell, /pathname\s*===\s*["']\/admin["']/)
  assert.match(siteShell, /pathname\.startsWith\(\s*["']\/admin\/["']\s*\)/)
  assert.match(siteShell, /Navbar/)
  assert.match(siteShell, /FaqSection/)
  assert.match(siteShell, /WhatsAppFloatingButton/)
  assert.match(siteShell, /CartPanel/)

  assert.match(adminPage, /AdminShell/)
  assert.match(adminPage, /Painel administrativo/)
  assert.match(adminPage, /Melhor Envio/)
  assert.match(adminNav, /Integrações/)
  assert.match(adminShell, /AdminMobileNav/)
  assert.match(adminMobileNav, /\/api\/admin\/logout/)
  assert.match(adminShell, />\s*Sair\s*</)
})
