import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  getOptionalCustomerIdentityWithDependencies,
  requireCustomerPageAccessWithDependencies,
  type CustomerAuthDependencies,
} from "../lib/server/customer-auth.ts"

class RedirectSignal extends Error {
  readonly path: string

  constructor(path: string) {
    super(`redirect:${path}`)
    this.path = path
  }
}

function staleSessionDependencies(): CustomerAuthDependencies {
  return {
    async getUser() {
      throw new Error("invalid stale auth cookie")
    },
    redirect(path) {
      throw new RedirectSignal(path)
    },
  }
}

test("stale customer auth cookie is treated as signed out instead of throwing", async () => {
  assert.equal(
    await getOptionalCustomerIdentityWithDependencies(staleSessionDependencies()),
    null,
  )

  await assert.rejects(
    () => requireCustomerPageAccessWithDependencies(staleSessionDependencies()),
    (error: unknown) => error instanceof RedirectSignal && error.path === "/entrar",
  )
})

test("Supabase proxy fails closed when claim validation throws on a stale cookie", async () => {
  const source = await readFile(
    new URL("../lib/supabase/proxy.ts", import.meta.url),
    "utf8",
  )

  assert.match(
    source,
    /let\s+claims[\s\S]*try\s*\{[\s\S]*await\s+supabase\.auth\.getClaims\s*\(\)[\s\S]*\}\s*catch\s*\{[\s\S]*claims\s*=\s*undefined/,
  )
})
