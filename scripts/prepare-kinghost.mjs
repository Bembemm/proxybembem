import { cp, mkdir, rm } from "node:fs/promises"

const root = new URL("../", import.meta.url)
const standalone = new URL("../.next/standalone/", import.meta.url)
const standalonePublic = new URL("../.next/standalone/public/", import.meta.url)
const standaloneStatic = new URL("../.next/standalone/.next/static/", import.meta.url)

await rm(standalonePublic, { recursive: true, force: true })
await rm(standaloneStatic, { recursive: true, force: true })
await mkdir(standalonePublic, { recursive: true })
await mkdir(standaloneStatic, { recursive: true })
await cp(new URL("public/", root), standalonePublic, { recursive: true })
await cp(new URL(".next/static/", root), standaloneStatic, { recursive: true })

console.log(`KingHost standalone package prepared at ${standalone.pathname}`)
