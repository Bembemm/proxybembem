import { isIP } from "node:net"

function parseIp(value: string | null | undefined) {
  const candidate = value?.trim()
  if (!candidate || candidate.length > 64 || isIP(candidate) === 0) {
    return null
  }
  return candidate
}

export function resolveClientIp(input: {
  forwardedFor: string | null
  realIp: string | null
  trustedProxyHops: number
}) {
  if (
    !Number.isInteger(input.trustedProxyHops) ||
    input.trustedProxyHops <= 0
  ) {
    return null
  }

  if (input.forwardedFor) {
    const chain = input.forwardedFor.split(",").map((part) => part.trim())
    if (chain.some((part) => parseIp(part) === null)) return null

    const index = chain.length - input.trustedProxyHops
    if (index < 0) return null
    return parseIp(chain[index])
  }

  return parseIp(input.realIp)
}
