import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("protected admin pages use one responsive server shell with fixed live navigation", async () => {
  const shell = await source("../components/admin/admin-shell.tsx")
  const nav = await source("../components/admin/admin-nav.tsx")

  assert.ok(shell.length > 0, "missing shared admin shell")
  assert.ok(nav.length > 0, "missing shared admin navigation")
  assert.doesNotMatch(shell, /^["']use client["']/m)
  assert.doesNotMatch(nav, /^["']use client["']/m)
  assert.doesNotMatch(nav, /usePathname/)

  assert.match(shell, /ProxyBembem/)
  assert.match(shell, /Painel administrativo/)
  assert.match(shell, /action=["']\/api\/admin\/logout["']/)
  assert.match(shell, /method=["']post["']/i)
  assert.match(shell, />\s*Sair\s*</)
  assert.match(shell, /children/)
  assert.doesNotMatch(shell, /setInterval|useEffect|poll/i)

  for (const [label, href] of [
    ["Visão geral", "/admin"],
    ["Pedidos", "/admin/pedidos"],
    ["Produção", "/admin/producao"],
    ["Integrações", "/admin/integrations/melhor-envio"],
  ] as const) {
    assert.match(nav, new RegExp(label))
    assert.match(nav, new RegExp(`href:\\s*["']${href.replaceAll("/", "\\/")}["']`))
  }

  assert.match(nav, /activeSection/)
  assert.match(nav, /flex-wrap|grid/)
})

test("status badges translate known operational states and keep unknown payment states neutral", async () => {
  const badge = await source("../components/admin/status-badge.tsx")
  assert.ok(badge.length > 0, "missing status badge")
  assert.doesNotMatch(badge, /^["']use client["']/m)

  for (const label of [
    "Pendente",
    "Aprovado",
    "Reembolsado",
    "Chargeback",
    "Revisão manual",
    "Aguardando pagamento",
    "Aguardando produção",
    "Em produção",
    "Pronto para envio",
    "Enviado",
    "Concluído",
    "Cancelado",
  ]) {
    assert.match(badge, new RegExp(label))
  }

  assert.match(badge, /Status desconhecido/)
  assert.match(badge, /bg-slate|text-slate/)
})

test("overview and Melhor Envio pages keep page-level auth while sharing the protected shell", async () => {
  const overview = await source("../app/admin/page.tsx")
  const integration = await source("../app/admin/integrations/melhor-envio/page.tsx")

  for (const page of [overview, integration]) {
    assert.match(page, /requireAdminPageAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
    assert.match(page, /AdminShell/)
    assert.match(page, /dynamic\s*=\s*["']force-dynamic["']/)
  }

  assert.match(overview, /activeSection=["']overview["']/)
  assert.match(overview, /Painel administrativo/)
  assert.match(overview, /Melhor Envio/)

  assert.match(integration, /activeSection=["']integrations["']/)
  assert.match(integration, /Integração Melhor Envio/)
  assert.match(integration, /action=["']\/api\/internal\/melhor-envio\/oauth\/start["']/)
})

test("login and MFA surfaces remain outside the protected operational shell", async () => {
  for (const path of [
    "../app/admin/login/page.tsx",
    "../app/admin/mfa/page.tsx",
    "../app/admin/setup-mfa/page.tsx",
  ]) {
    const text = await source(path)
    assert.ok(text.length > 0, `missing ${path}`)
    assert.doesNotMatch(text, /AdminShell/)
  }
})

test("orders list page is protected and maps only normalized URL filters into the server repository", async () => {
  const page = await source("../app/admin/pedidos/page.tsx")

  assert.ok(page.length > 0, "missing /admin/pedidos page")
  assert.doesNotMatch(page, /^["']use client["']/m)
  assert.match(page, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(page, /requireAdminPageAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(page, /await\s+searchParams/)
  assert.match(page, /listAdminOrders\s*\(/)
  assert.match(page, /activeSection=["']orders["']/)
  assert.match(page, /sort:\s*["']newest["']/)
  assert.match(page, /pageSize:\s*25/)

  for (const filter of ["q", "payment", "fulfillment", "attention", "from", "to", "page"]) {
    assert.match(page, new RegExp(`\\.${filter}\\b|\\[\\s*["']${filter}["']\\s*\\]`))
  }

  assert.match(page, /isFulfillmentStatus/)
  assert.match(page, /Number\.isSafeInteger|Number\.parseInt/)
  assert.match(page, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/)
  assert.match(page, /\^\[a-z\]/)
})

test("orders list renders operational summaries, safe badges and detail links without financial mutation controls", async () => {
  const page = await source("../app/admin/pedidos/page.tsx")

  assert.ok(page.length > 0, "missing /admin/pedidos page")
  assert.match(page, /PaymentStatusBadge/)
  assert.match(page, /FulfillmentStatusBadge/)
  assert.match(page, /total_cents\s*\?\?\s*order\.subtotal_cents/)
  assert.match(page, /America\/Sao_Paulo/)
  assert.match(page, /open_attention_count/)
  assert.match(page, /open_attention_severity/)
  assert.match(page, /\/admin\/pedidos\/\$\{order\.id\}/)
  assert.match(page, /Ver detalhes|Abrir pedido/)

  assert.doesNotMatch(
    page,
    /Marcar como pago|Aprovar pagamento|Forçar status|Forcar status|Reembolsar|Refundar/i,
  )
  assert.doesNotMatch(
    page,
    /public_token|checkout_fingerprint|checkout_url|shipping_snapshot|checkout_attempt_id/,
  )
})

test("orders list paginates on the server while preserving active filters", async () => {
  const page = await source("../app/admin/pedidos/page.tsx")

  assert.ok(page.length > 0, "missing /admin/pedidos page")
  assert.match(page, /URLSearchParams/)
  assert.match(page, /set\(\s*["']page["']/)
  assert.match(page, /Anterior/)
  assert.match(page, /Próxima|Proxima/)
  assert.match(page, /Math\.ceil\s*\(/)
  assert.doesNotMatch(page, /pageSize:\s*(?:51|[6-9]\d|\d{3,})/)
  assert.doesNotMatch(page, /createBrowserClient|createClientComponentClient/)
  assert.doesNotMatch(page, /\.sort\s*\(\s*\(/)
})
