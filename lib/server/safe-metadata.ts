const MAX_METADATA_BYTES = 16 * 1024
const MAX_METADATA_DEPTH = 8

const FORBIDDEN_KEY_FRAGMENTS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "fingerprint",
  "checkouturl",
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function normalizedKey(key: string) {
  return key.replace(/[_-]/g, "").toLowerCase()
}

function assertSafeValue(
  value: unknown,
  label: string,
  depth: number,
  stack: Set<object>,
): void {
  if (depth > MAX_METADATA_DEPTH) {
    throw new Error(`${label} too deep`)
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`non-json ${label} value`)
    }
    return
  }

  if (typeof value !== "object") {
    throw new Error(`non-json ${label} value`)
  }

  if (stack.has(value)) {
    throw new Error(`cyclic ${label}`)
  }

  stack.add(value)
  try {
    if (Array.isArray(value)) {
      for (const item of value) {
        assertSafeValue(item, label, depth + 1, stack)
      }
      return
    }

    if (!isPlainObject(value)) {
      throw new Error(`non-json ${label} value`)
    }

    for (const [key, child] of Object.entries(value)) {
      const normalized = normalizedKey(key)
      if (
        FORBIDDEN_KEY_FRAGMENTS.some((fragment) =>
          normalized.includes(fragment),
        )
      ) {
        throw new Error(`unsafe metadata key: ${key}`)
      }
      assertSafeValue(child, label, depth + 1, stack)
    }
  } finally {
    stack.delete(value)
  }
}

export function assertSafeMetadata(
  value: unknown,
  label = "metadata",
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(`non-json ${label} value`)
  }

  assertSafeValue(value, label, 0, new Set<object>())

  const serialized = JSON.stringify(value)
  if (Buffer.byteLength(serialized, "utf8") > MAX_METADATA_BYTES) {
    throw new Error(`${label} too large`)
  }
}
