import assert from "node:assert/strict"
import test from "node:test"
import { resolveClientIp } from "../lib/server/client-ip.ts"

test("resolves one trusted IPv4 forwarding hop", () => {
  assert.equal(
    resolveClientIp({
      forwardedFor: "203.0.113.9",
      realIp: null,
      trustedProxyHops: 1,
    }),
    "203.0.113.9",
  )
})

test("resolves one trusted IPv6 forwarding hop", () => {
  assert.equal(
    resolveClientIp({
      forwardedFor: "2001:db8::10",
      realIp: null,
      trustedProxyHops: 1,
    }),
    "2001:db8::10",
  )
})

test("selects from the trusted right side of x-forwarded-for instead of attacker prefixes", () => {
  assert.equal(
    resolveClientIp({
      forwardedFor: "198.51.100.99, 203.0.113.7",
      realIp: null,
      trustedProxyHops: 1,
    }),
    "203.0.113.7",
  )
  assert.equal(
    resolveClientIp({
      forwardedFor: "198.51.100.8, 10.0.0.10",
      realIp: null,
      trustedProxyHops: 2,
    }),
    "198.51.100.8",
  )
})

test("rejects malformed or insufficient forwarding chains", () => {
  for (const input of [
    {
      forwardedFor: "not-an-ip",
      realIp: null,
      trustedProxyHops: 1,
    },
    {
      forwardedFor: "198.51.100.8, not-an-ip",
      realIp: null,
      trustedProxyHops: 1,
    },
    {
      forwardedFor: "198.51.100.8",
      realIp: null,
      trustedProxyHops: 2,
    },
  ]) {
    assert.equal(resolveClientIp(input), null)
  }
})

test("x-real-ip is trusted only when an explicit proxy hop is configured", () => {
  assert.equal(
    resolveClientIp({
      forwardedFor: null,
      realIp: "192.0.2.4",
      trustedProxyHops: 1,
    }),
    "192.0.2.4",
  )
  assert.equal(
    resolveClientIp({
      forwardedFor: null,
      realIp: "192.0.2.4",
      trustedProxyHops: 0,
    }),
    null,
  )
})

test("invalid trust configuration fails closed", () => {
  for (const trustedProxyHops of [-1, 0, 1.5, Number.NaN]) {
    assert.equal(
      resolveClientIp({
        forwardedFor: "203.0.113.9",
        realIp: "192.0.2.4",
        trustedProxyHops,
      }),
      null,
    )
  }
})
