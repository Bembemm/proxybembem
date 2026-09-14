import assert from "node:assert/strict"
import test from "node:test"

const MODULE = "../lib/store-settings/store-settings.ts"

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    productionLeadTimeBusinessDays: 5,
    contactEmail: "contato@proxybembem.com.br",
    contactWhatsappE164: "+5544991250332",
    noticeEnabled: false,
    noticeText: null,
    ...overrides,
  }
}

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "default",
    production_lead_time_business_days: 5,
    contact_email: "contato@proxybembem.com.br",
    contact_whatsapp_e164: "+5544991250332",
    notice_enabled: false,
    notice_text: null,
    updated_at: "2026-09-14T21:00:00.000Z",
    ...overrides,
  }
}

test("validates and normalizes the exact V1 mutation shape", async () => {
  const domain = await import(MODULE)

  for (const leadTime of [1, 15]) {
    const result = domain.validateStoreSettingsMutationInput(
      validInput({
        productionLeadTimeBusinessDays: leadTime,
        contactEmail: "  Contato@ProxyBemBem.com.br  ",
        noticeText: "  Aviso importante  ",
      }),
    )
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.productionLeadTimeBusinessDays, leadTime)
      assert.equal(result.value.contactEmail, "contato@proxybembem.com.br")
      assert.equal(result.value.noticeText, "Aviso importante")
    }
  }
})

test("rejects invalid lead time and non-canonical WhatsApp values", async () => {
  const domain = await import(MODULE)

  for (const value of [0, 16, 1.5, "5"]) {
    const result = domain.validateStoreSettingsMutationInput(
      validInput({ productionLeadTimeBusinessDays: value }),
    )
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.fieldErrors.productionLeadTimeBusinessDays)
  }

  for (const value of [
    "5544991250332",
    "+55 44 99125-0332",
    "+55(44)99125-0332",
    "+0123456789",
    "+1234567",
    "+1234567890123456",
  ]) {
    const result = domain.validateStoreSettingsMutationInput(
      validInput({ contactWhatsappE164: value }),
    )
    assert.equal(result.ok, false, `expected invalid WhatsApp: ${value}`)
    if (!result.ok) assert.ok(result.fieldErrors.contactWhatsappE164)
  }
})

test("keeps optional public contact fields bounded and safe", async () => {
  const domain = await import(MODULE)

  for (const contactEmail of ["not-an-email", `a@${"b".repeat(250)}.com`, "a\nb@example.com"]) {
    const result = domain.validateStoreSettingsMutationInput(validInput({ contactEmail }))
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.fieldErrors.contactEmail)
  }

  const empty = domain.validateStoreSettingsMutationInput(
    validInput({ contactEmail: "   ", contactWhatsappE164: null }),
  )
  assert.equal(empty.ok, true)
  if (empty.ok) {
    assert.equal(empty.value.contactEmail, null)
    assert.equal(empty.value.contactWhatsappE164, null)
  }
})

test("normalizes notice text and requires content only when enabled", async () => {
  const domain = await import(MODULE)

  const disabledEmpty = domain.validateStoreSettingsMutationInput(
    validInput({ noticeEnabled: false, noticeText: "   " }),
  )
  assert.equal(disabledEmpty.ok, true)
  if (disabledEmpty.ok) assert.equal(disabledEmpty.value.noticeText, null)

  for (const noticeText of [null, "   "]) {
    const result = domain.validateStoreSettingsMutationInput(
      validInput({ noticeEnabled: true, noticeText }),
    )
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.fieldErrors.noticeText)
  }

  for (const noticeText of ["x".repeat(401), "linha 1\nlinha 2", "aviso\u0000oculto"]) {
    const result = domain.validateStoreSettingsMutationInput(validInput({ noticeText }))
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.fieldErrors.noticeText)
  }
})

test("rejects unexpected mutation keys instead of silently ignoring dangerous settings", async () => {
  const domain = await import(MODULE)

  for (const extra of [
    { mercadoPagoAccessToken: "secret" },
    { secret: "secret" },
    { priceCents: 1 },
    { shippingPrice: 1 },
  ]) {
    const result = domain.validateStoreSettingsMutationInput({ ...validInput(), ...extra })
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.fieldErrors._form)
  }
})

test("parses only the exact singleton persisted row and a valid ISO revision", async () => {
  const domain = await import(MODULE)

  assert.deepEqual(domain.parseStoreSettingsRow(validRow()), {
    id: "default",
    productionLeadTimeBusinessDays: 5,
    contactEmail: "contato@proxybembem.com.br",
    contactWhatsappE164: "+5544991250332",
    noticeEnabled: false,
    noticeText: null,
    updatedAt: "2026-09-14T21:00:00.000Z",
  })

  for (const row of [
    validRow({ id: "other" }),
    validRow({ updated_at: "not-a-date" }),
    validRow({ production_lead_time_business_days: 16 }),
    { ...validRow(), provider_secret: "nope" },
  ]) {
    assert.throws(() => domain.parseStoreSettingsRow(row), /invalid store settings row/i)
  }
})

test("public projection is allowlisted and safe defaults contain no contacts", async () => {
  const domain = await import(MODULE)
  const parsed = domain.parseStoreSettingsRow(validRow())

  assert.deepEqual(domain.toPublicStoreSettings(parsed), {
    productionLeadTimeBusinessDays: 5,
    contactEmail: "contato@proxybembem.com.br",
    contactWhatsappE164: "+5544991250332",
    noticeEnabled: false,
    noticeText: null,
  })
  assert.deepEqual(domain.DEFAULT_PUBLIC_STORE_SETTINGS, {
    productionLeadTimeBusinessDays: 5,
    contactEmail: null,
    contactWhatsappE164: null,
    noticeEnabled: false,
    noticeText: null,
  })
  assert.equal("id" in domain.toPublicStoreSettings(parsed), false)
  assert.equal("updatedAt" in domain.toPublicStoreSettings(parsed), false)
})
