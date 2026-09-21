import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"

const retiredProvider = ["king", "host"].join("")

test("tracked project files contain no retired hosting-provider references", () => {
  const grep = spawnSync(
    "git",
    ["grep", "-I", "-i", "-n", retiredProvider, "--", "."],
    { encoding: "utf8" },
  )

  assert.equal(grep.status, 1, grep.stdout || grep.stderr)
})
