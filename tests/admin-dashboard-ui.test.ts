import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const PERIOD_CARD = new URL(
  "../components/admin/dashboard-period-card.tsx",
  import.meta.url,
)
const OPERATIONS = new URL(
  "../components/admin/dashboard-operations.tsx",
  import.meta.url,
)
const ATTENTION = new URL(
  "../components/admin/dashboard-attention-center.tsx",
  import.meta.url,
)
const PRODUCTS = new URL(
  "../components/admin/dashboard-product-sales.tsx",
  import.meta.url,
)
const ADMIN_PAGE = new URL("../app/admin/page.tsx", import.meta.url)

async function source(url: URL) {
  return readFile(url, "utf8")
}

function assertServerPresentationOnly(text: string) {
  assert.doesNotMatch(text, /["']use client["']/)
  assert.doesNotMatch(text, /useEffect\s*\(/)
  assert.doesNotMatch(text, /\bfetch\s*\(/)
  assert.doesNotMatch(text, /<form\b/i)
}

test("period card presents Today Week and Month without client-side authority", async () => {
  const text = await source(PERIOD_CARD)
  assert.match(text, /DashboardPeriodCard/)
  assert.match(text, /Hoje/)
  assert.match(text, /Semana/)
  assert.match(text, /Mês/)
  assertServerPresentationOnly(text)
})

test("operations component shows current fulfillment and financial-risk queues", async () => {
  const text = await source(OPERATIONS)
  assert.match(text, /DashboardOperations/)
  assert.match(text, /Aguardando produção/)
  assert.match(text, /Em produção/)
  assert.match(text, /Pronto para envio/)
  assert.match(text, /Enviados/)
  assert.match(text, /Em revisão/)
  assert.match(text, /Reembolsados/)
  assert.match(text, /Chargebacks/)
  assertServerPresentationOnly(text)
})

test("attention center is read-only safe and links to existing order flows", async () => {
  const text = await source(ATTENTION)
  assert.match(text, /DashboardAttentionCenter/)
  assert.match(text, /Requer atenção/)
  assert.match(text, /Ver todos/)
  assert.match(text, /\/admin\/pedidos\?attention=1/)
  assert.match(text, /`\/admin\/pedidos\/\$\{item\.orderId\}`/)
  assert.match(text, /getAttentionReasonLabel\s*\(\s*item\.primaryCode\s*\)/)
  assert.match(text, /Nenhum pedido requer atenção agora\./)
  assert.doesNotMatch(text, /item\.metadata/)
  assert.doesNotMatch(text, /JSON\.stringify/)
  assertServerPresentationOnly(text)
})

test("product sales component renders approved snapshot ranking without catalog fetch", async () => {
  const text = await source(PRODUCTS)
  assert.match(text, /DashboardProductSales/)
  assert.match(text, /Produtos vendidos no mês/)
  assert.match(text, /Nenhuma venda aprovada neste mês\./)
  assert.match(text, /product\.quantity/)
  assertServerPresentationOnly(text)
})

test("admin home loads the protected server snapshot and keeps failures visibly non-zero", async () => {
  const page = await source(ADMIN_PAGE)

  assert.match(page, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(page, /requireAdminPageAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(page, /getAdminDashboardSnapshot\s*\(/)
  assert.match(page, /DashboardPeriodCard/)
  assert.match(page, /DashboardOperations/)
  assert.match(page, /DashboardAttentionCenter/)
  assert.match(page, /DashboardProductSales/)
  assert.match(page, /Não foi possível carregar os indicadores agora/)
  assert.match(page, /Os dados não foram substituídos por zeros/)
  assert.match(page, /\/admin\/integrations\/melhor-envio/)

  assert.doesNotMatch(page, /\bfetch\s*\(/)
  assert.doesNotMatch(page, /supabase\.co/i)
  assert.doesNotMatch(page, /order_events/)
  assert.doesNotMatch(page, /order_attention_flags/)
})
