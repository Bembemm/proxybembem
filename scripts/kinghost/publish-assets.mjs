import { access, cp, mkdir, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptPath = fileURLToPath(import.meta.url)
const defaultProjectRoot = path.resolve(path.dirname(scriptPath), "../..")

async function copyDirectoryContents(source, destination) {
  const entries = await readdir(source, { withFileTypes: true })
  await mkdir(destination, { recursive: true })

  for (const entry of entries) {
    await cp(path.join(source, entry.name), path.join(destination, entry.name), {
      recursive: true,
      force: true,
    })
  }
}

export async function publishKingHostAssets({
  projectRoot = defaultProjectRoot,
  webRoot = path.join(homedir(), "www"),
} = {}) {
  const resolvedProjectRoot = path.resolve(projectRoot)
  const resolvedWebRoot = path.resolve(webRoot)
  const publicSource = path.join(resolvedProjectRoot, "public")
  const staticSource = path.join(resolvedProjectRoot, ".next", "static")

  // Validate every required source before mutating the public webroot.
  await Promise.all([access(publicSource), access(staticSource)])

  await copyDirectoryContents(publicSource, resolvedWebRoot)
  await copyDirectoryContents(
    staticSource,
    path.join(resolvedWebRoot, "_next", "static"),
  )

  return { webRoot: resolvedWebRoot }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) {
  const { webRoot } = await publishKingHostAssets({
    projectRoot: process.env.KINGHOST_PROJECT_ROOT || defaultProjectRoot,
    webRoot: process.env.KINGHOST_WEB_ROOT || path.join(homedir(), "www"),
  })

  console.log(`KingHost browser assets published to ${webRoot}`)
}
