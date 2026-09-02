import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  ensureOwnCustomerProfileWithDependencies,
  getOwnCustomerProfileWithDependencies,
  updateOwnCustomerProfileWithDependencies,
  type CustomerProfileDependencies,
} from "../lib/server/customer-profiles.ts"

const USER_ID = "550e8400-e29b-41d4-a716-446655440000"
const STORED_ROW = {
  id: USER_ID,
  name: "Cliente Teste",
  whatsapp: "44999999999",
  created_at: "2026-09-02T12:00:00.000Z",
  updated_at: "2026-09-02T12:05:00.000Z",
  email: "must-not-leak@example.com",
  password_hash: "must-not-leak",
}

function dependencies(overrides: Partial<CustomerProfileDependencies> = {}): CustomerProfileDependencies {
  return {
    getCurrentUserId: async () => USER_ID,
    readOwnProfile: async () => STORED_ROW,
    upsertOwnProfile: async () => STORED_ROW,
    updateOwnProfile: async () => STORED_ROW,
    ...overrides,
  }
}

test("reads only exact safe customer profile fields", async () => {
  assert.deepEqual(await getOwnCustomerProfileWithDependencies(dependencies()), {
    id: USER_ID,
    name: "Cliente Teste",
    whatsapp: "44999999999",
    createdAt: "2026-09-02T12:00:00.000Z",
    updatedAt: "2026-09-02T12:05:00.000Z",
  })

  assert.equal(
    await getOwnCustomerProfileWithDependencies(
      dependencies({ readOwnProfile: async () => null }),
    ),
    null,
  )
})

test("ensure normalizes name and WhatsApp and writes only trusted profile fields", async () => {
  const writes: Array<Record<string, unknown>> = []
  const result = await ensureOwnCustomerProfileWithDependencies(
    {
      name: "  Cliente   Teste  ",
      whatsapp: "(44) 99999-9999",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "attacker@example.com",
      password: "must-not-write",
    } as never,
    dependencies({
      upsertOwnProfile: async (profile) => {
        writes.push(profile as unknown as Record<string, unknown>)
        return {
          ...STORED_ROW,
          name: profile.name,
          whatsapp: profile.whatsapp,
        }
      },
    }),
  )

  assert.deepEqual(writes, [
    {
      id: USER_ID,
      name: "Cliente Teste",
      whatsapp: "44999999999",
    },
  ])
  assert.deepEqual(result, {
    id: USER_ID,
    name: "Cliente Teste",
    whatsapp: "44999999999",
    createdAt: "2026-09-02T12:00:00.000Z",
    updatedAt: "2026-09-02T12:05:00.000Z",
  })
})

test("update uses trusted current user id and never accepts arbitrary profile ownership", async () => {
  const writes: Array<{ userId: string; profile: Record<string, unknown> }> = []

  await updateOwnCustomerProfileWithDependencies(
    {
      name: "  Novo   Nome  ",
      whatsapp: "44 98888-7777",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "replace@example.com",
      password: "secret",
    } as never,
    dependencies({
      updateOwnProfile: async (userId, profile) => {
        writes.push({
          userId,
          profile: profile as unknown as Record<string, unknown>,
        })
        return {
          ...STORED_ROW,
          name: profile.name,
          whatsapp: profile.whatsapp,
        }
      },
    }),
  )

  assert.deepEqual(writes, [
    {
      userId: USER_ID,
      profile: { name: "Novo Nome", whatsapp: "44988887777" },
    },
  ])
})

test("invalid profile input and missing trusted identity fail before storage mutation", async () => {
  let writes = 0
  const deps = dependencies({
    upsertOwnProfile: async () => {
      writes += 1
      return STORED_ROW
    },
    updateOwnProfile: async () => {
      writes += 1
      return STORED_ROW
    },
  })

  for (const input of [
    { name: "ab", whatsapp: "44999999999" },
    { name: "x".repeat(101), whatsapp: "44999999999" },
    { name: "Cliente Teste", whatsapp: "123" },
    { name: "Cliente Teste", whatsapp: "1".repeat(12) },
  ]) {
    await assert.rejects(() => ensureOwnCustomerProfileWithDependencies(input, deps))
    await assert.rejects(() => updateOwnCustomerProfileWithDependencies(input, deps))
  }

  await assert.rejects(() =>
    ensureOwnCustomerProfileWithDependencies(
      { name: "Cliente Teste", whatsapp: "44999999999" },
      dependencies({ getCurrentUserId: async () => null }),
    ),
  )
  assert.equal(writes, 0)
})

test("production profile repository uses the authenticated SSR client and RLS table boundary", async () => {
  const source = await readFile(
    new URL("../lib/server/customer-profiles.ts", import.meta.url),
    "utf8",
  )

  assert.match(source, /createSupabaseServerClient/)
  assert.match(source, /auth\.getUser\s*\(/)
  assert.match(source, /from\(["']customer_profiles["']\)/)
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEY|service[_-]?role|getSupabaseEnv|customer_id\s*:/i)
})
