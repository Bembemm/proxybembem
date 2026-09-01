import assert from "node:assert/strict"
import test from "node:test"
import * as serverEnv from "../lib/server/env.ts"

const ADMIN_ID = "11111111-1111-4111-8111-111111111111"
const PUBLIC_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "ADMIN_USER_ID",
] as const

async function loadBrowserConfigModule() {
  return import("../lib/supabase/config.ts").catch(() => null)
}

async function withPublicEnv(
  values: Partial<Record<(typeof PUBLIC_KEYS)[number], string | undefined>>,
  run: () => Promise<void> | void,
) {
  const previous = new Map<string, string | undefined>()
  for (const key of PUBLIC_KEYS) {
    previous.set(key, process.env[key])
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  try {
    await run()
  } finally {
    for (const key of PUBLIC_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("admin auth accepts browser-safe Supabase config plus immutable owner UUID", async () => {
  const browserConfig = await loadBrowserConfigModule()
  assert.ok(browserConfig, "expected lib/supabase/config.ts to exist")
  assert.equal(
    typeof (serverEnv as Record<string, unknown>).getAdminAuthEnv,
    "function",
    "expected getAdminAuthEnv() to exist",
  )

  await withPublicEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co/path-that-must-be-normalized",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_1234567890",
      ADMIN_USER_ID: ADMIN_ID.toUpperCase(),
    },
    () => {
      assert.deepEqual(browserConfig.getSupabaseBrowserConfig(), {
        url: "https://project.supabase.co",
        publishableKey: "sb_publishable_test_key_1234567890",
      })
      assert.deepEqual(
        (serverEnv as unknown as { getAdminAuthEnv(): { adminUserId: string } }).getAdminAuthEnv(),
        { adminUserId: ADMIN_ID },
      )
    },
  )
})

test("browser-safe Supabase config rejects insecure, missing, and non-publishable values", async () => {
  const browserConfig = await loadBrowserConfigModule()
  assert.ok(browserConfig, "expected lib/supabase/config.ts to exist")

  await withPublicEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "http://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_1234567890",
      ADMIN_USER_ID: ADMIN_ID,
    },
    () => assert.throws(() => browserConfig.getSupabaseBrowserConfig(), /https/i),
  )

  await withPublicEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
      ADMIN_USER_ID: ADMIN_ID,
    },
    () => assert.throws(() => browserConfig.getSupabaseBrowserConfig(), /publishable/i),
  )

  await withPublicEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-or-secret-key",
      ADMIN_USER_ID: ADMIN_ID,
    },
    () => assert.throws(() => browserConfig.getSupabaseBrowserConfig(), /publishable/i),
  )
})

test("admin UUID contract rejects missing or malformed IDs", async () => {
  assert.equal(
    typeof (serverEnv as Record<string, unknown>).getAdminAuthEnv,
    "function",
    "expected getAdminAuthEnv() to exist",
  )
  const getAdminAuthEnv = (
    serverEnv as unknown as { getAdminAuthEnv(): { adminUserId: string } }
  ).getAdminAuthEnv

  await withPublicEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_1234567890",
      ADMIN_USER_ID: undefined,
    },
    () => assert.throws(() => getAdminAuthEnv(), /ADMIN_USER_ID/),
  )

  await withPublicEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_1234567890",
      ADMIN_USER_ID: "not-a-uuid",
    },
    () => assert.throws(() => getAdminAuthEnv(), /uuid/i),
  )
})
