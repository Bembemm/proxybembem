const path = require("node:path")

function resolveKingHostPort(env = process.env) {
  const raw = env.PORT_PROXYBEMBEM_APP || env.PORT_APP || env.PORT || "3000"
  const port = Number.parseInt(raw, 10)
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    String(port) !== String(raw).trim()
  ) {
    throw new Error("KingHost runtime requires a valid port")
  }
  return String(port)
}

function resolveKingHostHostname() {
  return "0.0.0.0"
}

function startKingHostRuntime() {
  process.env.PORT = resolveKingHostPort(process.env)
  process.env.HOSTNAME = resolveKingHostHostname(process.env)
  require(path.join(__dirname, ".next", "standalone", "server.js"))
}

if (require.main === module) {
  startKingHostRuntime()
}

module.exports = { resolveKingHostPort, resolveKingHostHostname, startKingHostRuntime }
