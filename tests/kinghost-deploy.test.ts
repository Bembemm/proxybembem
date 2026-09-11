import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const PUBLISHER = fileURLToPath(
  new URL("../scripts/kinghost/publish-assets.mjs", import.meta.url),
)

async function exists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

test("KingHost asset publisher copies browser assets into the webroot without deleting existing files", async () => {
  assert.equal(
    await exists(PUBLISHER),
    true,
    "expected scripts/kinghost/publish-assets.mjs to exist",
  )

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "proxybembem-kinghost-"))
  const projectRoot = path.join(temporaryRoot, "project")
  const webRoot = path.join(temporaryRoot, "www")

  try {
    await mkdir(path.join(projectRoot, "public", "products"), { recursive: true })
    await mkdir(path.join(projectRoot, ".next", "static", "css"), {
      recursive: true,
    })
    await mkdir(path.join(webRoot, "_next", "static"), { recursive: true })

    await writeFile(path.join(projectRoot, "public", "logo.png"), "logo")
    await writeFile(
      path.join(projectRoot, "public", "products", "card.txt"),
      "card",
    )
    await writeFile(
      path.join(projectRoot, ".next", "static", "css", "app.css"),
      "body{}",
    )
    await writeFile(path.join(webRoot, "keep.txt"), "keep")
    await writeFile(path.join(webRoot, "_next", "static", "old.js"), "old")

    await execFileAsync(process.execPath, [PUBLISHER], {
      env: {
        ...process.env,
        KINGHOST_PROJECT_ROOT: projectRoot,
        KINGHOST_WEB_ROOT: webRoot,
      },
    })

    assert.equal(await readFile(path.join(webRoot, "logo.png"), "utf8"), "logo")
    assert.equal(
      await readFile(path.join(webRoot, "products", "card.txt"), "utf8"),
      "card",
    )
    assert.equal(
      await readFile(path.join(webRoot, "_next", "static", "css", "app.css"), "utf8"),
      "body{}",
    )
    assert.equal(await readFile(path.join(webRoot, "keep.txt"), "utf8"), "keep")
    assert.equal(
      await readFile(path.join(webRoot, "_next", "static", "old.js"), "utf8"),
      "old",
    )
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
