import test from "node:test"

test("admin auth module imports cleanly", async () => {
  await import("../lib/server/admin-auth.ts")
})
