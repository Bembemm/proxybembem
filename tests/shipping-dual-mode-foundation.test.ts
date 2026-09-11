import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609080003_shipments_foundation.sql",
  import.meta.url,
)
const DOMAIN = new URL("../lib/shipments/shipment.ts", import.meta.url)

async function text(url: URL) {
  return (await readFile(url, "utf8")).toLowerCase()
}

test("shipment foundation supports PF/CPF and PJ/CNPJ sender profiles per environment", async () => {
  const sql = await text(MIGRATION)

  assert.match(sql, /person_type\s+text\s+not\s+null[^;]*'pf'[^;]*'pj'/)
  assert.match(sql, /cpf\s+text/)
  assert.match(sql, /cnpj\s+text/)
  assert.match(sql, /state_register\s+text/)
  assert.match(sql, /economic_activity_code\s+text/)
  assert.match(sql, /cpf[^;]*\^\\d\{11\}\$/)
  assert.match(sql, /cnpj[^;]*\^\\d\{14\}\$/)

  assert.match(
    sql,
    /person_type\s*=\s*'pf'[\s\S]*?cpf\s+is\s+not\s+null[\s\S]*?cnpj\s+is\s+null/,
  )
  assert.match(
    sql,
    /person_type\s*=\s*'pj'[\s\S]*?cnpj\s+is\s+not\s+null[\s\S]*?cpf\s+is\s+null/,
  )

  assert.match(
    sql,
    /unique\s*\(\s*environment\s*,\s*person_type\s*\)|create\s+unique\s+index[\s\S]*?\(\s*environment\s*,\s*person_type\s*\)/,
  )
  assert.doesNotMatch(sql, /environment\s+text\s+not\s+null\s+unique/)
})

test("shipments persist both declaration-content and invoice document modes", async () => {
  const [sql, domain] = await Promise.all([text(MIGRATION), text(DOMAIN)])

  assert.match(sql, /document_mode[^;]*'declaration_content'[^;]*'invoice'/)
  assert.match(sql, /invoice_key\s+text/)
  assert.match(sql, /invoice_key[^;]*\^\\d\{44\}\$/)
  assert.match(
    sql,
    /document_mode\s*=\s*'invoice'[\s\S]*?invoice_key\s+is\s+not\s+null/,
  )
  assert.match(
    sql,
    /document_mode\s*=\s*'declaration_content'[\s\S]*?invoice_key\s+is\s+null/,
  )

  assert.match(domain, /shipment_document_modes[\s\S]*"declaration_content"[\s\S]*"invoice"/)
})
