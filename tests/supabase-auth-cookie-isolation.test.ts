import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  ADMIN_AUTH_COOKIE_NAME,
  CUSTOMER_AUTH_COOKIE_NAME,
} from "../lib/supabase/auth-scope.ts"
import { supabaseAuthScopeForPath } from "../lib/security/proxy-routing.ts"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("admin and customer auth use distinct cookie namespaces", () => {
  assert.equal(CUSTOMER_AUTH_COOKIE_NAME, "pb-customer-auth")
  assert.equal(ADMIN_AUTH_COOKIE_NAME, "pb-admin-auth")
  assert.notEqual(CUSTOMER_AUTH_COOKIE_NAME, ADMIN_AUTH_COOKIE_NAME)
})

test("protected routes select the correct Supabase auth scope", () => {
  for (const path of [
    "/admin",
    "/admin/pedidos",
    "/api/admin/orders",
    "/api/internal/melhor-envio/oauth/start",
  ]) {
    assert.equal(supabaseAuthScopeForPath(path), "admin", path)
  }

  for (const path of [
    "/entrar",
    "/criar-conta",
    "/minha-conta",
    "/api/account/login",
    "/api/checkout",
  ]) {
    assert.equal(supabaseAuthScopeForPath(path), "customer", path)
  }
})

test("browser, server, route and proxy clients preserve cookie isolation", async () => {
  const [client, server, route, proxy] = await Promise.all([
    source("../lib/supabase/client.ts"),
    source("../lib/supabase/server.ts"),
    source("../lib/supabase/route.ts"),
    source("../lib/supabase/proxy.ts"),
  ])

  assert.match(client, /createAdminSupabaseBrowserClient/)
  assert.match(client, /createSupabaseBrowserClient/)
  assert.match(client, /authCookieName\(scope\)/)
  assert.match(client, /isSingleton:\s*false/)

  assert.match(server, /createAdminSupabaseServerClient/)
  assert.match(server, /createScopedSupabaseServerClient\("customer"\)/)
  assert.match(server, /createScopedSupabaseServerClient\("admin"\)/)

  assert.match(route, /CUSTOMER_AUTH_COOKIE_NAME/)
  assert.doesNotMatch(route, /ADMIN_AUTH_COOKIE_NAME/)

  assert.match(proxy, /supabaseAuthScopeForPath\(pathname\)/)
  assert.match(proxy, /authCookieName\(authScope\)/)
})

test("admin UI and authorization never use the customer Supabase client", async () => {
  const files = [
    "../app/admin/login/login-form.tsx",
    "../app/admin/mfa/mfa-form.tsx",
    "../app/admin/setup-mfa/setup-mfa-form.tsx",
    "../app/admin/mfa/page.tsx",
    "../app/admin/setup-mfa/page.tsx",
    "../components/admin/products/product-image-field.tsx",
    "../lib/server/admin-auth.ts",
  ]

  for (const path of files) {
    const text = await source(path)
    assert.match(
      text,
      /createAdminSupabase(?:Browser|Server)Client/,
      `${path} must use the admin-scoped Supabase client`,
    )
  }
})
