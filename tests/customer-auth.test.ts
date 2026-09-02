import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  getOptionalCustomerIdentityWithDependencies,
  requireCustomerPageAccessWithDependencies,
  type CustomerAuthDependencies,
} from "../lib/server/customer-auth.ts"

const VERIFIED_USER = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: " Cliente+Deck@Example.COM ",
  email_confirmed_at: "2026-09-02T12:00:00.000Z",
}

class RedirectSignal extends Error {
  constructor(readonly path: string) {
    super(`redirect:${path}`)
  }
}

function dependencies(user: unknown): CustomerAuthDependencies {
  return {
    async getUser() {
      return user
    },
    redirect(path) {
      throw new RedirectSignal(path)
    },
  }
}

test("optional customer identity returns null when there is no authenticated user", async () => {
  assert.equal(await getOptionalCustomerIdentityWithDependencies(dependencies(null)), null)
})

test("verified canonical Supabase user becomes a normalized trusted customer identity", async () => {
  assert.deepEqual(
    await getOptionalCustomerIdentityWithDependencies(dependencies(VERIFIED_USER)),
    {
      userId: "550e8400-e29b-41d4-a716-446655440000",
      email: "cliente+deck@example.com",
      emailVerified: true,
    },
  )
})

test("malformed or unverified Supabase users are never accepted as trusted customer identity", async () => {
  const invalidUsers = [
    { ...VERIFIED_USER, id: "not-a-uuid" },
    { ...VERIFIED_USER, id: "00000000-0000-0000-0000-000000000000" },
    { ...VERIFIED_USER, email: "not-an-email" },
    { ...VERIFIED_USER, email: "a".repeat(255) },
    { ...VERIFIED_USER, email_confirmed_at: null },
    { ...VERIFIED_USER, email_confirmed_at: "not-a-date" },
  ]

  for (const user of invalidUsers) {
    assert.equal(await getOptionalCustomerIdentityWithDependencies(dependencies(user)), null)
  }
})

test("protected customer pages redirect missing or unverified identity to /entrar", async () => {
  for (const user of [null, { ...VERIFIED_USER, email_confirmed_at: null }]) {
    await assert.rejects(
      () => requireCustomerPageAccessWithDependencies(dependencies(user)),
      (error: unknown) => error instanceof RedirectSignal && error.path === "/entrar",
    )
  }
})

test("protected customer pages return only the verified customer identity", async () => {
  assert.deepEqual(
    await requireCustomerPageAccessWithDependencies(dependencies(VERIFIED_USER)),
    {
      userId: "550e8400-e29b-41d4-a716-446655440000",
      email: "cliente+deck@example.com",
      emailVerified: true,
    },
  )
})

test("customer auth uses network-validated getUser and stays independent from admin authorization", async () => {
  const source = await readFile(
    new URL("../lib/server/customer-auth.ts", import.meta.url),
    "utf8",
  )

  assert.match(source, /createSupabaseServerClient/)
  assert.match(source, /auth\.getUser\s*\(/)
  assert.doesNotMatch(source, /auth\.getSession\s*\(/)
  assert.doesNotMatch(
    source,
    /ADMIN_USER_ID|adminUserId|admin_sessions|authorizeAdminAccess|activateCurrentAdminSession|authorizeAdminSession|activateAdminSession/,
  )
  assert.doesNotMatch(source, /\/admin\/login/)
})
