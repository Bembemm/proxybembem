import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"

const retiredMarkers = [
  ["king", "host"].join(""),
  ["x-cron", "auth"].join("-"),
  ["PORT", "PROXYBEMBEM", "APP"].join("_"),
  ["PORT", "APP"].join("_"),
  ["apps", "nodejs"].join("_"),
]

test("tracked project files contain no retired hosting-provider configuration", () => {
  for (const marker of retiredMarkers) {
    const grep = spawnSync(
      "git",
      ["grep", "-I", "-i", "-n", marker, "--", "."],
      { encoding: "utf8" },
    )

    assert.equal(grep.status, 1, grep.stdout || grep.stderr)
  }
})
