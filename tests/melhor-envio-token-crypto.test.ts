import assert from "node:assert/strict"
import test from "node:test"

const key = "a".repeat(64)

async function loadCrypto() {
  const module = (await import("../lib/server/melhor-envio-token-crypto.ts")) as Record<
    string,
    unknown
  >
  assert.equal(typeof module.encryptMelhorEnvioToken, "function")
  assert.equal(typeof module.decryptMelhorEnvioToken, "function")
  return {
    encrypt: module.encryptMelhorEnvioToken as (input: {
      plaintext: string
      environment: "sandbox" | "production"
      kind: "access" | "refresh"
      encryptionKeyHex: string
    }) => string,
    decrypt: module.decryptMelhorEnvioToken as (input: {
      envelope: string
      environment: "sandbox" | "production"
      kind: "access" | "refresh"
      encryptionKeyHex: string
    }) => string,
  }
}

test("encrypts and decrypts a token with environment and token-kind AAD", async () => {
  const { encrypt, decrypt } = await loadCrypto()
  const envelope = encrypt({
    plaintext: "sandbox-access-token",
    environment: "sandbox",
    kind: "access",
    encryptionKeyHex: key,
  })

  assert.match(envelope, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.equal(
    decrypt({ envelope, environment: "sandbox", kind: "access", encryptionKeyHex: key }),
    "sandbox-access-token",
  )
})

test("uses a fresh nonce so the same token encrypts differently", async () => {
  const { encrypt } = await loadCrypto()
  const input = {
    plaintext: "same-token",
    environment: "sandbox" as const,
    kind: "refresh" as const,
    encryptionKeyHex: key,
  }

  assert.notEqual(encrypt(input), encrypt(input))
})

test("rejects decrypting a token in the wrong environment", async () => {
  const { encrypt, decrypt } = await loadCrypto()
  const envelope = encrypt({
    plaintext: "production-access-token",
    environment: "production",
    kind: "access",
    encryptionKeyHex: key,
  })

  assert.throws(
    () => decrypt({ envelope, environment: "sandbox", kind: "access", encryptionKeyHex: key }),
    /Invalid Melhor Envio token envelope/,
  )
})

test("rejects swapping encrypted access and refresh tokens", async () => {
  const { encrypt, decrypt } = await loadCrypto()
  const envelope = encrypt({
    plaintext: "refresh-token",
    environment: "sandbox",
    kind: "refresh",
    encryptionKeyHex: key,
  })

  assert.throws(
    () => decrypt({ envelope, environment: "sandbox", kind: "access", encryptionKeyHex: key }),
    /Invalid Melhor Envio token envelope/,
  )
})

test("rejects ciphertext and authentication-tag tampering without leaking token data", async () => {
  const { encrypt, decrypt } = await loadCrypto()
  const plaintext = "never-echo-this-token"
  const envelope = encrypt({
    plaintext,
    environment: "sandbox",
    kind: "access",
    encryptionKeyHex: key,
  })
  const parts = envelope.split(".")

  for (const index of [2, 3]) {
    const tampered = [...parts]
    const value = tampered[index]
    assert.ok(value)
    tampered[index] = `${value.slice(0, -1)}${value.endsWith("A") ? "B" : "A"}`

    assert.throws(
      () =>
        decrypt({
          envelope: tampered.join("."),
          environment: "sandbox",
          kind: "access",
          encryptionKeyHex: key,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(error.message, "Invalid Melhor Envio token envelope")
        assert.doesNotMatch(error.message, new RegExp(plaintext))
        return true
      },
    )
  }
})

test("rejects unknown versions and malformed envelopes", async () => {
  const { decrypt } = await loadCrypto()

  for (const envelope of [
    "v2.a.b.c",
    "v1.only-two-parts",
    "v1...",
    "garbage",
    "",
  ]) {
    assert.throws(
      () => decrypt({ envelope, environment: "sandbox", kind: "access", encryptionKeyHex: key }),
      /Invalid Melhor Envio token envelope/,
    )
  }
})

test("fails closed when called directly with an invalid encryption key", async () => {
  const { encrypt, decrypt } = await loadCrypto()

  assert.throws(
    () =>
      encrypt({
        plaintext: "token",
        environment: "sandbox",
        kind: "access",
        encryptionKeyHex: "not-a-256-bit-key",
      }),
    /Invalid Melhor Envio token encryption input/,
  )

  assert.throws(
    () =>
      decrypt({
        envelope: "v1.a.b.c",
        environment: "sandbox",
        kind: "access",
        encryptionKeyHex: "not-a-256-bit-key",
      }),
    /Invalid Melhor Envio token envelope/,
  )
})
