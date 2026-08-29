import { createHash, timingSafeEqual } from "node:crypto"

export function timingSafeSecretEqual(candidate: string, expected: string) {
  const candidateDigest = createHash("sha256").update(candidate).digest()
  const expectedDigest = createHash("sha256").update(expected).digest()
  return timingSafeEqual(candidateDigest, expectedDigest)
}
