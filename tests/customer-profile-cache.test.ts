import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("profile save invalidates visited customer-account routes through a server action", async () => {
  const action = await source("../app/minha-conta/perfil/actions.ts")
  const form = await source("../components/account/profile-form.tsx")
  const route = await source("../app/api/account/profile/route.ts")
  const shell = await source("../components/account/account-shell.tsx")

  assert.match(action, /^["']use server["']/m)
  assert.match(action, /from\s+["']next\/cache["']/)
  assert.match(action, /requireCustomerPageAccess/)
  assert.match(
    action,
    /revalidatePath\(\s*["']\/minha-conta["']\s*,\s*["']layout["']\s*\)/,
  )

  assert.match(form, /refreshCustomerAccountViews/)
  assert.match(form, /await\s+refreshCustomerAccountViews\(\s*\)/)
  assert.match(form, /router\.refresh\(\s*\)/)

  assert.doesNotMatch(route, /from\s+["']next\/cache["']/)
  assert.match(shell, /<Link[\s\S]*?prefetch=\{false\}[\s\S]*?href=\{item\.href\}/)
})
