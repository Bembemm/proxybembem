import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const PHASE5_SCOPES = [
  "shipping-calculate",
  "cart-read",
  "cart-write",
  "orders-read",
  "shipping-checkout",
  "shipping-generate",
  "shipping-print",
  "shipping-tracking",
  "shipping-cancel",
] as const

const PHASE5_MIGRATIONS = [
  "202609080002_melhor_envio_oauth_scope_grants.sql",
  "202609080003_shipments_foundation.sql",
  "202609080004_shipment_operations.sql",
  "202609080005_shipment_cancel_reconciliation.sql",
  "202609080006_customer_shipment_projection.sql",
  "20260909194848_shipments_sender_profile_fk_index.sql",
] as const

async function read(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("shipping setup documents the live Phase 5 PF/DC-e flow and staged spending controls", async () => {
  const source = await read("../docs/shipping-setup.md")

  for (const expected of [
    "PF/CPF",
    "DC-e",
    "DACE",
    "MELHOR_ENVIO_LABEL_PURCHASE_ENABLED",
    "Preparar remessa",
    "Comprar etiqueta",
    "Gerar etiqueta",
    "/api/internal/melhor-envio/tracking",
    "/minha-conta/pedidos/",
    "docs/deployment/kinghost.md",
  ]) {
    assert.ok(source.includes(expected), `shipping setup must include ${expected}`)
  }

  for (const scope of PHASE5_SCOPES) {
    assert.ok(source.includes(scope), `shipping setup must include OAuth scope ${scope}`)
  }

  assert.match(source, /remetente[^\n]*(fix|cadast)|(?:fix|cadast)[^\n]*remetente/i)
  assert.match(source, /compra[^\n]*(expl[ií]cit|manual)[^\n]*(?:gera|gera[cç][aã]o)|gera[cç][aã]o[^\n]*separad/i)
  assert.match(source, /n[aã]o[^\n]*compra[^\n]*autom[aá]tic/i)
  assert.match(source, /rastreamento[^\n]*(?:hora|hour)|(?:hora|hour)[^\n]*rastreamento/i)
  assert.match(source, /03:17/)
  assert.match(source, /cancel[^\n]*confirma/i)
  assert.match(source, /(?:um|uma|1)[^\n]*(?:pacote|volume)[^\n]*(?:etiqueta|label)|(?:etiqueta|label)[^\n]*(?:um|uma|1)[^\n]*(?:pacote|volume)/i)
  assert.match(source, /MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false/)
  assert.match(source, /MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=true/)

  assert.doesNotMatch(source, /somente para cota[cç][aã]o/i)
  assert.doesNotMatch(source, /compra, gera[cç][aã]o e impress[aã]o de etiqueta continuam manuais/i)
})

test("operational status preserves Phase 5 acceptance evidence and closes Task 20", async () => {
  const [status, master] = await Promise.all([
    read("../docs/superpowers/CURRENT_STATUS.md"),
    read("../docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md"),
  ])

  for (const source of [status, master]) {
    assert.match(source, /PHASE 5|Phase 5/)
    assert.match(source, /non-spending|sem gasto|n[aã]o[- ]pag/i)
    assert.match(source, /in_cart/)
    assert.match(source, /R\$\s*23,69/)
    assert.match(source, /Task 18[^\n]*(?:owner accepted|aceit[ao][^\n]*propriet[aá]ri|propriet[aá]ri[^\n]*aceit)/i)
    assert.match(source, /owner[- ]reported|declarad[ao][^\n]*propriet[aá]ri|informad[ao][^\n]*propriet[aá]ri/i)
    assert.match(source, /MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false/)
    assert.match(source, /Task 19[^\n]*(?:complete|conclu[ií]d)|(?:complete|conclu[ií]d)[^\n]*Task 19/i)
    assert.match(source, /Task 20[^\n]*(?:complete|conclu[ií]d|owner accepted|aceit[ao])/i)
    assert.match(source, /Phase 5[^\n]*(?:complete|conclu[ií]d|accepted|aceit)/i)
    assert.doesNotMatch(source, /Task 18\s+(?:pending|pendente)\b/i)
    assert.doesNotMatch(source, /(?:pending|pendente)\s+Task 18\b/i)
    assert.doesNotMatch(source, /Task 20\s+(?:pending|pendente)\b/i)
    assert.doesNotMatch(source, /(?:pending|pendente)\s+Task 20\b/i)
    assert.doesNotMatch(source, /finish Task 19|finalizar[^\n]*Task 19|finish[^\n]*Task 19/i)
  }

  for (const migration of PHASE5_MIGRATIONS) {
    assert.ok(status.includes(migration), `current status must record applied migration ${migration}`)
  }

  assert.doesNotMatch(master, /# PHASE 5[^#]*\*\*State: NOT STARTED\.\*\*/)
  assert.doesNotMatch(status, /Do not start Phase 5 automatically|N[aã]o iniciar Phase 5/i)
})

test("Phase 5 docs keep secrets out and reference the canonical KingHost runbook", async () => {
  const sources = await Promise.all([
    read("../docs/shipping-setup.md"),
    read("../docs/superpowers/CURRENT_STATUS.md"),
    read("../docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md"),
  ])

  const combined = sources.join("\n")
  assert.ok(combined.includes("docs/deployment/kinghost.md"))
  assert.doesNotMatch(combined, /Bearer\s+[A-Za-z0-9._~-]{20,}/)
  assert.doesNotMatch(combined, /MELHOR_ENVIO_CLIENT_SECRET=[^\s<][^\n]*/)
  assert.doesNotMatch(combined, /MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY=[0-9a-fA-F]{64}/)
})
