import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto"
import type { MelhorEnvioEnvironment } from "./env.ts"

export type MelhorEnvioTokenKind = "access" | "refresh"

const ENVELOPE_VERSION = "v1"
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

function aad(environment: MelhorEnvioEnvironment, kind: MelhorEnvioTokenKind) {
  return `proxybembem:melhor-envio:${ENVELOPE_VERSION}:${environment}:${kind}`
}

function parseEncryptionKey(encryptionKeyHex: string) {
  if (!KEY_HEX_PATTERN.test(encryptionKeyHex)) {
    throw new Error("Invalid Melhor Envio token encryption input")
  }

  const key = Buffer.from(encryptionKeyHex, "hex")
  if (key.length !== 32) {
    throw new Error("Invalid Melhor Envio token encryption input")
  }
  return key
}

function decodeEnvelopePart(value: string) {
  if (!value || !BASE64URL_PATTERN.test(value)) {
    throw new Error("Invalid Melhor Envio token envelope")
  }
  return Buffer.from(value, "base64url")
}

export function encryptMelhorEnvioToken(input: {
  plaintext: string
  environment: MelhorEnvioEnvironment
  kind: MelhorEnvioTokenKind
  encryptionKeyHex: string
}): string {
  if (!input.plaintext) {
    throw new Error("Invalid Melhor Envio token encryption input")
  }

  const key = parseEncryptionKey(input.encryptionKeyHex)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(aad(input.environment, input.kind), "utf8"))

  const ciphertext = Buffer.concat([
    cipher.update(input.plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".")
}

export function decryptMelhorEnvioToken(input: {
  envelope: string
  environment: MelhorEnvioEnvironment
  kind: MelhorEnvioTokenKind
  encryptionKeyHex: string
}): string {
  try {
    if (!KEY_HEX_PATTERN.test(input.encryptionKeyHex)) {
      throw new Error("invalid key")
    }

    const key = Buffer.from(input.encryptionKeyHex, "hex")
    if (key.length !== 32) throw new Error("invalid key")

    const parts = input.envelope.split(".")
    if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
      throw new Error("invalid envelope")
    }

    const iv = decodeEnvelopePart(parts[1] ?? "")
    const ciphertext = decodeEnvelopePart(parts[2] ?? "")
    const tag = decodeEnvelopePart(parts[3] ?? "")

    if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES || ciphertext.length < 1) {
      throw new Error("invalid envelope")
    }

    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAAD(Buffer.from(aad(input.environment, input.kind), "utf8"))
    decipher.setAuthTag(tag)

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8")

    if (!plaintext) throw new Error("invalid plaintext")
    return plaintext
  } catch {
    throw new Error("Invalid Melhor Envio token envelope")
  }
}
