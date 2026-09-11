import assert from "node:assert/strict"
import test from "node:test"

const CONFIG = new URL("../next.config.mjs", import.meta.url)

test("Next Image allows the configured Supabase product-images public bucket", async () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"

  try {
    const configUrl = new URL(CONFIG)
    configUrl.searchParams.set("test-case", "product-images")
    const loaded = (await import(configUrl.href)) as {
      default: {
        images?: {
          remotePatterns?: Array<{
            protocol?: string
            hostname?: string
            port?: string
            pathname?: string
          }>
        }
      }
    }

    const patterns = loaded.default.images?.remotePatterns ?? []
    assert.equal(patterns.length, 1)
    assert.deepEqual(patterns[0], {
      protocol: "https",
      hostname: "example.supabase.co",
      port: "",
      pathname: "/storage/v1/object/public/product-images/**",
    })
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous
  }
})
