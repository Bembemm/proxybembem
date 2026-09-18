import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("normal password change requires the current password while recovery stays separate", async () => {
  const actions = await import("../lib/server/customer-account-actions.ts")
  assert.equal(typeof actions.parseAccountPasswordChangeInput, "function")

  const parseChange = actions.parseAccountPasswordChangeInput as (value: unknown) => {
    currentPassword: string
    password: string
  }

  assert.deepEqual(
    parseChange({
      currentPassword: "CurrentPassword1!",
      password: "NewPassword2@",
    }),
    {
      currentPassword: "CurrentPassword1!",
      password: "NewPassword2@",
    },
  )
  assert.throws(() => parseChange({ password: "NewPassword2@" }))

  assert.deepEqual(actions.parseAccountPasswordUpdateInput({ password: "NewPassword2@" }), {
    password: "NewPassword2@",
  })
})

test("password route sends current_password only for authenticated password changes", async () => {
  const route = await source("../app/api/account/password/route.ts")
  const recovery = await source("../app/api/account/password-recovery/route.ts")
  const limits = await source("../lib/server/rate-limit.ts")

  assert.match(route, /parseAccountPasswordChangeInput/)
  assert.match(route, /current_password\s*:\s*input\.currentPassword/)
  assert.match(route, /password\s*:\s*input\.password/)
  assert.match(route, /readJsonBody\s*\(\s*request\s*,\s*4_096\s*\)/)
  assert.match(route, /private,\s*no-store/i)
  assert.match(route, /account-password-change/)
  assert.match(
    limits,
    /"account-password-change"\s*:\s*\{\s*limit:\s*5,\s*windowSeconds:\s*900\s*\}/,
  )

  assert.doesNotMatch(recovery, /current_password/)
  assert.match(recovery, /parseAccountPasswordUpdateInput/)
})

test("password form asks for current password only outside recovery mode", async () => {
  const form = await source("../components/account/password-form.tsx")

  assert.match(form, /currentPassword/)
  assert.match(form, /Senha atual/)
  assert.match(form, /autoComplete=["']current-password["']/)
  assert.match(form, /recovery\s*\?/)
  assert.match(form, /JSON\.stringify\([^)]*currentPassword/)
  assert.match(form, /JSON\.stringify\([^)]*password/)
})
