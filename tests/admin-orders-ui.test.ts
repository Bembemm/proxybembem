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

test("order detail authorizes, loads the order before history and scopes audit to that order", async () => {
  const page = await source("../app/admin/pedidos/[id]/page.tsx")

  assert.ok(page.length > 0, "missing /admin/pedidos/[id] page")
  assert.doesNotMatch(page, /^["']use client["']/m)
  assert.match(page, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(page, /requireAdminPageAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(page, /await\s+params/)
  assert.match(page, /getAdminOrderById\s*\(\s*id\s*\)/)
  assert.match(page, /notFound\s*\(\s*\)/)
  assert.match(page, /Promise\.all\s*\(/)
  assert.match(page, /listOrderEvents\s*\(\s*id\s*\)/)
  assert.match(page, /listOpenOrderAttention\s*\(\s*id\s*\)/)
  assert.match(page, /listAdminAuditForEntity\s*\(\s*\{[\s\S]*entityType:\s*["']order["'][\s\S]*entityId:\s*id/)
  assert.ok(
    page.indexOf("getAdminOrderById") < page.indexOf("Promise.all"),
    "order must load before related history",
  )
})

test("order detail renders the approved operational sections without checkout internals", async () => {
  const page = await source("../app/admin/pedidos/[id]/page.tsx")

  assert.ok(page.length > 0, "missing /admin/pedidos/[id] page")
  for (const label of [
    "Resumo do pedido",
    "Produção",
    "Alertas",
    "Itens",
    "Cliente",
    "Entrega",
    "Frete",
    "Mercado Pago",
    "Linha do tempo",
    "Auditoria",
  ]) {
    assert.match(page, new RegExp(label))
  }

  assert.match(page, /order\.items\.map/)
  assert.match(page, /order\.address_street/)
  assert.match(page, /order\.shipping_service_name/)
  assert.match(page, /order\.payment_id/)
  assert.match(page, /order\.payment_status_detail/)
  assert.match(page, /PaymentStatusBadge/)
  assert.match(page, /FulfillmentStatusBadge/)
  assert.match(page, /America\/Sao_Paulo/)

  assert.doesNotMatch(
    page,
    /public_token|checkout_fingerprint|checkout_url|shipping_snapshot|checkout_attempt_id/,
  )
  assert.doesNotMatch(page, /createBrowserClient|createClientComponentClient/)
})

test("order detail derives only approved fulfillment actions and uses hardcoded redirect feedback", async () => {
  const page = await source("../app/admin/pedidos/[id]/page.tsx")

  assert.ok(page.length > 0, "missing /admin/pedidos/[id] page")
  assert.match(page, /allowedAdminFulfillmentTransitions/)
  assert.match(page, /payment_status\s*===\s*["']approved["']/)

  for (const [label, action] of [
    ["Iniciar produção", "start-production"],
    ["Marcar pronto para envio", "mark-ready-to-ship"],
    ["Marcar enviado", "mark-shipped"],
    ["Marcar concluído", "mark-completed"],
    ["Cancelar pedido", "cancel"],
  ] as const) {
    assert.match(page, new RegExp(label))
    assert.match(page, new RegExp(`/api/internal/admin/orders/\\$\\{order\\.id\\}/${action}`))
  }

  assert.match(page, /method=["']post["']/i)
  assert.match(page, /pagamento[^\n]*aprovado|pagamento aprovado/i)
  assert.match(page, /não[^\n]*reembolsa[^\n]*automaticamente|não[^\n]*reembolso automático/i)
  assert.match(page, /reversão[^\n]*provedor|provedor[^\n]*reversão/i)

  for (const status of ["updated", "unchanged", "invalid-transition", "payment-required"]) {
    assert.match(page, new RegExp(`(?:["']${status}["']|\\b${status}\\b)\\s*:`))
  }

  assert.doesNotMatch(page, /name=["'](?:targetStatus|payment_status|payment_id)["']/)
  assert.doesNotMatch(page, /Marcar como pago|Aprovar pagamento|Forçar status|Forcar status|Refundar/i)
})

test("destructive confirmation opens safely and submits only from the explicit POST confirmation form", async () => {
  const confirm = await source("../components/admin/danger-confirm-form.tsx")

  assert.ok(confirm.length > 0, "missing destructive confirmation component")
  assert.match(confirm, /^["']use client["']/m)
  assert.match(confirm, /from\s+["']\.\.\/ui\/dialog["']/)
  assert.match(confirm, /DialogTrigger/)
  assert.match(confirm, /DialogContent/)
  assert.match(confirm, /DialogTitle/)
  assert.match(confirm, /DialogDescription/)
  assert.match(confirm, /DialogClose/)

  for (const prop of ["action", "buttonLabel", "title", "description", "confirmLabel"]) {
    assert.match(confirm, new RegExp(`${prop}:\\s*string`))
  }

  assert.match(confirm, /<DialogTrigger\s+asChild>[\s\S]*?<button[\s\S]*?type=["']button["']/)
  assert.match(confirm, /<form\s+method=["']post["']\s+action=\{action\}>/i)
  assert.match(confirm, /<button[\s\S]*?type=["']submit["'][\s\S]*?>[\s\S]*?\{confirmLabel\}/)
  assert.match(confirm, /<DialogClose\s+asChild>[\s\S]*?<button[\s\S]*?type=["']button["']/)
  assert.doesNotMatch(confirm, /ADMIN_USER_ID|SUPABASE_SECRET_KEY|service_role|MELHOR_ENVIO_|MERCADO_PAGO_|payment_id|payment_status|localStorage/)
  assert.doesNotMatch(confirm, /<input[^>]+type=["']hidden["']/)
})

test("order detail requires destructive confirmation only for cancellation", async () => {
  const page = await source("../app/admin/pedidos/[id]/page.tsx")

  assert.match(page, /DangerConfirmForm/)
  const destructive = page.match(/<DangerConfirmForm[\s\S]*?\/>/)?.[0] ?? ""
  assert.ok(destructive, "missing cancellation confirmation invocation")
  assert.match(destructive, /\/api\/internal\/admin\/orders\/\$\{order\.id\}\/cancel/)
  assert.match(destructive, /buttonLabel=["']Cancelar pedido["']/)
  assert.match(destructive, /title=["']Confirmar cancelamento["']/)
  assert.match(destructive, /description=\{CANCELLATION_COPY\}/)
  assert.match(destructive, /confirmLabel=["']Sim, cancelar pedido["']/)
  assert.doesNotMatch(destructive, /start-production|mark-ready-to-ship|mark-shipped|mark-completed/)

  for (const action of ["start-production", "mark-ready-to-ship", "mark-shipped", "mark-completed"]) {
    assert.match(page, new RegExp(`<ActionForm[\\s\\S]*?${action}`))
  }
})
