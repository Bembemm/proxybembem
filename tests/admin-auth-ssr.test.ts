import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("browser Supabase client uses only browser-safe publishable configuration", async () => {
  const text = await source("../lib/supabase/client.ts")
  assert.match(text, /createBrowserClient/)
  assert.match(text, /getSupabaseBrowserConfig/)
  assert.doesNotMatch(text, /SUPABASE_SECRET_KEY|service_role|sb_secret_/)
})

test("server Supabase client is request-scoped and cookie backed", async () => {
  const text = await source("../lib/supabase/server.ts")
  assert.match(text, /createServerClient/)
  assert.match(text, /cookies\s*\(/)
  assert.match(text, /getAll/)
  assert.match(text, /setAll/)
  assert.doesNotMatch(text, /SUPABASE_SECRET_KEY|service_role|sb_secret_/)
})

test("proxy validates claims instead of trusting getSession and never touches admin inactivity", async () => {
  const text = await source("../lib/supabase/proxy.ts")
  assert.match(text, /getClaims\s*\(/)
  assert.doesNotMatch(text, /getSession\s*\(/)
  assert.doesNotMatch(text, /admin_sessions|last_activity_at|authorizeAdminSession|touch\s*:/)
  assert.match(text, /\/admin\/login/)
  assert.match(text, /\/admin\/mfa/)
  assert.match(text, /\/admin\/setup-mfa/)
})

test("proxy redirect copies only explicit cache-safety headers, never internal control headers", async () => {
  const text = await source("../lib/supabase/proxy.ts")
  assert.match(text, /cache-control/i)
  assert.match(text, /expires/i)
  assert.match(text, /pragma/i)
  assert.doesNotMatch(text, /source\.headers\.forEach/)
})

test("root Next proxy is narrowly matched to admin auth surfaces", async () => {
  const text = await source("../proxy.ts")
  assert.match(text, /updateSupabaseSession/)
  assert.match(text, /["']\/admin\/:path\*["']/)
  assert.match(text, /["']\/api\/admin\/:path\*["']/)
  assert.match(text, /["']\/api\/internal\/melhor-envio\/oauth\/start["']/)
})
