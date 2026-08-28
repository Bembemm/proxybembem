import assert from "node:assert/strict"
import test from "node:test"
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  readJsonBody,
} from "../lib/server/request-body.ts"

test("reads valid JSON without requiring Content-Length", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    body: JSON.stringify({ ok: true }),
  })
  request.headers.delete("content-length")

  assert.deepEqual(await readJsonBody(request, 100), { ok: true })
})

test("rejects malformed JSON", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    body: "{broken",
  })

  await assert.rejects(() => readJsonBody(request, 100), InvalidJsonBodyError)
})

test("accepts a body exactly at the byte limit", async () => {
  const body = JSON.stringify({ value: "abc" })
  const limit = Buffer.byteLength(body, "utf8")
  const request = new Request("https://example.test/api", { method: "POST", body })

  assert.deepEqual(await readJsonBody(request, limit), { value: "abc" })
})

test("rejects a body one byte above the real limit even without Content-Length", async () => {
  const body = JSON.stringify({ value: "abc" })
  const limit = Buffer.byteLength(body, "utf8") - 1
  const request = new Request("https://example.test/api", { method: "POST", body })
  request.headers.delete("content-length")

  await assert.rejects(() => readJsonBody(request, limit), RequestBodyTooLargeError)
})

test("does not trust a dishonest smaller Content-Length", async () => {
  const body = JSON.stringify({ value: "a".repeat(40) })
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Length": "1" },
    body,
  })

  await assert.rejects(() => readJsonBody(request, 20), RequestBodyTooLargeError)
})

test("rejects immediately when declared Content-Length exceeds the limit", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Length": "999" },
    body: "{}",
  })

  await assert.rejects(() => readJsonBody(request, 100), RequestBodyTooLargeError)
})

test("counts UTF-8 multibyte characters as bytes", async () => {
  const body = JSON.stringify({ value: "á" })
  assert.ok(Buffer.byteLength(body, "utf8") > body.length)
  const request = new Request("https://example.test/api", { method: "POST", body })

  await assert.rejects(
    () => readJsonBody(request, body.length),
    RequestBodyTooLargeError,
  )
})
