import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("password recovery uses a 256-bit app token and a domain-separated HMAC grant key", async () => {
  const helper = await import("../lib/server/password-recovery-grant.ts").catch(() => null)
  assert.ok(helper, "durable password recovery grant helper must exist")
  if (!helper) return

  const token = helper.createPasswordRecoveryToken()
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(helper.isValidPasswordRecoveryToken(token), true)
  assert.equal(helper.isValidPasswordRecoveryToken("a".repeat(42)), false)
  assert.equal(helper.isValidPasswordRecoveryToken("a".repeat(44)), false)

  const key1 = helper.derivePasswordRecoveryGrantKey(token, "s".repeat(32))
  const key2 = helper.derivePasswordRecoveryGrantKey(token, "s".repeat(32))
  const differentSecret = helper.derivePasswordRecoveryGrantKey(token, "t".repeat(32))
  assert.match(key1, /^[0-9a-f]{64}$/)
  assert.equal(key1, key2)
  assert.notEqual(key1, differentSecret)
})

test("recovery issuance persists an app grant before sending the email", async () => {
  const resetRoute = await source("../app/api/account/password-reset/route.ts")

  assert.match(resetRoute, /createPasswordRecoveryToken/)
  assert.match(resetRoute, /issuePasswordRecoveryGrant/)
  assert.match(resetRoute, /data\.user\?\.id|data\.user\.id/)
  assert.match(resetRoute, /sendPasswordRecoveryEmail/)

  const issueAt = resetRoute.indexOf("await issuePasswordRecoveryGrant")
  const sendAt = resetRoute.indexOf("await sendPasswordRecoveryEmail")
  assert.ok(issueAt >= 0 && sendAt >= 0 && issueAt < sendAt)
})

test("recovery confirmation rejects consumed revoked or expired grants before setting a cookie", async () => {
  const confirmRoute = await source("../app/auth/confirm/route.ts")
  const grantHelper = await source("../lib/server/password-recovery-grant.ts")
  const validationMigration = await source(
    "../supabase/migrations/202609050002_password_recovery_grant_validation.sql",
  )

  assert.match(confirmRoute, /isPasswordRecoveryGrantActive/)
  assert.match(confirmRoute, /await\s+isPasswordRecoveryGrantActive\s*\(\s*tokenHash\s*\)/)
  const checkAt = confirmRoute.indexOf("await isPasswordRecoveryGrantActive")
  const cookieAt = confirmRoute.indexOf("response.cookies.set")
  assert.ok(checkAt >= 0 && cookieAt >= 0 && checkAt < cookieAt)

  assert.match(grantHelper, /check_password_recovery_grant/)
  assert.match(validationMigration, /create or replace function public\.check_password_recovery_grant/i)
  assert.match(validationMigration, /security definer/i)
  assert.match(validationMigration, /set search_path = ''/i)
  assert.match(validationMigration, /consumed_at is null/i)
  assert.match(validationMigration, /revoked_at is null/i)
  assert.match(validationMigration, /expires_at > clock_timestamp\(\)/i)
  assert.match(
    validationMigration,
    /revoke all on function public\.check_password_recovery_grant\(text\)[\s\S]*from public, anon, authenticated, service_role/i,
  )
  assert.match(
    validationMigration,
    /grant execute on function public\.check_password_recovery_grant\(text\)[\s\S]*to service_role/i,
  )
})

test("final recovery uses a durable grant and server-only admin password update", async () => {
  const route = await source("../app/api/account/password-recovery/route.ts")

  assert.match(route, /claimPasswordRecoveryGrant/)
  assert.match(route, /finishPasswordRecoveryGrant/)
  assert.match(route, /auth\.admin\.updateUserById\s*\(/)
  assert.doesNotMatch(route, /auth\.verifyOtp\s*\(/)
  assert.doesNotMatch(route, /auth\.getClaims\s*\(/)
  assert.doesNotMatch(route, /auth\.getUser\s*\(/)
  assert.doesNotMatch(route, /auth\.updateUser\s*\(/)
})

test("durable recovery migration locks direct access and service-role RPCs", async () => {
  const migration = await source(
    "../supabase/migrations/202609050001_password_recovery_grants.sql",
  )

  assert.match(migration, /create table if not exists public\.password_recovery_grants/i)
  assert.match(migration, /enable row level security/i)
  assert.match(
    migration,
    /revoke all on table public\.password_recovery_grants\s+from public, anon, authenticated, service_role/i,
  )
  assert.match(migration, /create or replace function public\.issue_password_recovery_grant/i)
  assert.match(migration, /create or replace function public\.claim_password_recovery_grant/i)
  assert.match(migration, /create or replace function public\.finish_password_recovery_grant/i)
  assert.match(migration, /security definer/gi)
  assert.match(migration, /set search_path = ''/gi)
  assert.match(migration, /grant execute on function public\.issue_password_recovery_grant[\s\S]*to service_role/i)
  assert.match(migration, /grant execute on function public\.claim_password_recovery_grant[\s\S]*to service_role/i)
  assert.match(migration, /grant execute on function public\.finish_password_recovery_grant[\s\S]*to service_role/i)
  assert.match(migration, /set revoked_at = v_now/i)
  assert.match(migration, /return query select 'busy'::text/i)
  assert.match(migration, /p_retry_window_seconds/i)
})

test("durable recovery implementation never logs recovery credential values", async () => {
  const combined = [
    await source("../app/api/account/password-reset/route.ts"),
    await source("../app/api/account/password-recovery/route.ts"),
    await source("../app/auth/confirm/route.ts"),
    await source("../lib/server/password-recovery-grant.ts"),
  ].join("\n")

  assert.doesNotMatch(
    combined,
    /console\.(?:log|info|warn|error)\([^\n]*(?:token|grant_key|grantKey|password|input\.email|RESEND_API_KEY|SUPABASE_SECRET_KEY|request\.cookies)/i,
  )
})
