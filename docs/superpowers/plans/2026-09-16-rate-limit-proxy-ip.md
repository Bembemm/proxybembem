# Rate Limit Proxy IP Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent spoofed/malformed forwarding headers from becoming rate-limit identities while preserving Supabase-backed distributed rate limiting.

**Architecture:** Extract client-IP resolution into a pure helper based on validated IPv4/IPv6 values and an explicit trusted-proxy-hop count. `consumeRateLimit` continues hashing the derived identity with HMAC and storing counters through the existing Supabase RPC. Unknown/untrusted forwarding data collapses to the existing deterministic `unknown` bucket instead of becoming attacker-controlled input.

**Tech Stack:** Node 22.1.0 (`node:net`), TypeScript 5.7.3, Supabase REST/RPC, Next.js Request API.

**Spec:** `docs/superpowers/specs/2026-09-16-site-security-nonce-hardening-design.md`

## Global Constraints

- Do not change existing per-scope limits/windows without separate evidence.
- Never store or transmit raw client IPs to Supabase; only the HMAC bucket remains server-side.
- KingHost forwarding behavior is not assumed to be trustworthy without explicit configuration.
- Production must fail safely if proxy trust is misconfigured.

---

## File Structure

- Create `lib/server/client-ip.ts`: pure parsing/validation/trusted-hop selection.
- Modify `lib/server/env.ts`: parse `RATE_LIMIT_TRUSTED_PROXY_HOPS`.
- Modify `lib/server/rate-limit.ts`: use the pure resolver.
- Modify `.env.example`: document the new setting.
- Modify `docs/deployment/kinghost.md` and `docs/deployment/kinghost-sandbox.md`: state how to verify/configure trusted hops before rollout.
- Modify `tests/rate-limit.test.ts`: behavioral coverage for spoofing, IPv4, IPv6, chains and fallback.

### Task 1: Define client-IP parsing behavior

**Files:**
- Create: `lib/server/client-ip.ts`
- Modify: `tests/rate-limit.test.ts`

**Interfaces:**
- Produces `resolveClientIp(input: { forwardedFor: string | null; realIp: string | null; trustedProxyHops: number }): string | null`.

- [ ] **Step 1: Add failing unit cases**

Add direct tests for the new helper:

```ts
import { resolveClientIp } from "../lib/server/client-ip.ts"

test("resolves validated IPv4 and IPv6 from the trusted side of XFF", () => {
  assert.equal(resolveClientIp({
    forwardedFor: "203.0.113.9",
    realIp: null,
    trustedProxyHops: 1,
  }), "203.0.113.9")
  assert.equal(resolveClientIp({
    forwardedFor: "2001:db8::10",
    realIp: null,
    trustedProxyHops: 1,
  }), "2001:db8::10")
})

test("selects the client hop from the right side, not attacker prefix", () => {
  assert.equal(resolveClientIp({
    forwardedFor: "198.51.100.99, 203.0.113.7",
    realIp: null,
    trustedProxyHops: 1,
  }), "203.0.113.7")
})

test("supports two explicitly trusted proxies", () => {
  assert.equal(resolveClientIp({
    forwardedFor: "198.51.100.8, 10.0.0.10",
    realIp: null,
    trustedProxyHops: 2,
  }), "198.51.100.8")
})

test("rejects malformed values and excessive/insufficient chains", () => {
  assert.equal(resolveClientIp({ forwardedFor: "spoof-me", realIp: null, trustedProxyHops: 1 }), null)
  assert.equal(resolveClientIp({ forwardedFor: "203.0.113.7", realIp: null, trustedProxyHops: 2 }), null)
  assert.equal(resolveClientIp({ forwardedFor: "203.0.113.7, bad", realIp: null, trustedProxyHops: 1 }), null)
})

test("uses validated x-real-ip only when forwarding headers are trusted", () => {
  assert.equal(resolveClientIp({ forwardedFor: null, realIp: "192.0.2.5", trustedProxyHops: 1 }), "192.0.2.5")
  assert.equal(resolveClientIp({ forwardedFor: null, realIp: "spoof", trustedProxyHops: 1 }), null)
  assert.equal(resolveClientIp({ forwardedFor: null, realIp: "192.0.2.5", trustedProxyHops: 0 }), null)
})
```

- [ ] **Step 2: Run to verify failure**

```bash
node --experimental-strip-types --test tests/rate-limit.test.ts
```

Expected: FAIL because `client-ip.ts` does not exist.

- [ ] **Step 3: Implement strict parser**

Create `lib/server/client-ip.ts` using `isIP` from `node:net`:

```ts
import { isIP } from "node:net"

function parseIp(value: string | undefined | null) {
  const candidate = value?.trim()
  if (!candidate || candidate.length > 64 || isIP(candidate) === 0) return null
  return candidate
}

export function resolveClientIp(input: {
  forwardedFor: string | null
  realIp: string | null
  trustedProxyHops: number
}) {
  if (!Number.isInteger(input.trustedProxyHops) || input.trustedProxyHops <= 0) {
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
```

- [ ] **Step 4: Run rate-limit tests**

Expected: new pure resolver tests PASS; old tests may fail until Tasks 2-3 update environment semantics.

- [ ] **Step 5: Commit**

```bash
git add lib/server/client-ip.ts tests/rate-limit.test.ts
git commit -m "test: define trusted proxy IP resolution"
```

### Task 2: Make proxy trust explicit in server environment

**Files:**
- Modify: `lib/server/env.ts`
- Modify: `.env.example`
- Modify: `tests/rate-limit.test.ts`

**Interfaces:**
- `RateLimitEnv` gains `trustedProxyHops: number`.
- `RATE_LIMIT_TRUSTED_PROXY_HOPS` accepts integers `0..5`; `0` means ignore forwarding headers.

- [ ] **Step 1: Extend the test environment helper**

Include `RATE_LIMIT_TRUSTED_PROXY_HOPS` in the test key list and set it to `1` in the standard `withEnv` helper. Add cases asserting `0`, `1`, `2` are accepted and negative/non-integer/greater-than-5 values throw.

- [ ] **Step 2: Run tests and confirm failure**

Expected: FAIL because `RateLimitEnv` does not expose the new property.

- [ ] **Step 3: Implement bounded integer parsing**

Add a server-only parser in `lib/server/env.ts`:

```ts
function boundedInteger(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim()
  const value = raw ? Number(raw) : fallback
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return value
}
```

Return:

```ts
trustedProxyHops: boundedInteger("RATE_LIMIT_TRUSTED_PROXY_HOPS", 0, 0, 5)
```

Use default `0` so an unconfigured deployment does not silently trust attacker-controlled forwarding headers. `.env.example` should contain:

```text
# Number of reverse-proxy hops explicitly trusted for rate-limit client IP resolution.
# Keep 0 until the KingHost header chain has been verified; use the verified count in each deployment.
RATE_LIMIT_TRUSTED_PROXY_HOPS=0
```

- [ ] **Step 4: Run focused tests**

Expected: PASS for environment cases.

- [ ] **Step 5: Commit**

```bash
git add lib/server/env.ts .env.example tests/rate-limit.test.ts
git commit -m "feat: require explicit proxy trust for rate limits"
```

### Task 3: Use the resolver in distributed rate limiting

**Files:**
- Modify: `lib/server/rate-limit.ts`
- Modify: `tests/rate-limit.test.ts`

**Interfaces:**
- `consumeRateLimit` retains its public signature.
- HMAC identity becomes `resolveClientIp(...) ?? "unknown"`.

- [ ] **Step 1: Update existing behavioral tests first**

For tests expecting an IP bucket, set `RATE_LIMIT_TRUSTED_PROXY_HOPS=1`. Add a spoof regression asserting `x-forwarded-for: "fake, 203.0.113.9"` hashes `203.0.113.9`, and malformed input hashes `unknown`. Add an IPv6 bucket case.

- [ ] **Step 2: Run and verify failure against old implementation**

Expected: spoof/malformed assertions FAIL because the old parser trusts the first string.

- [ ] **Step 3: Replace old parser**

Delete `firstUsableForwardedValue` and `getClientIp`. Import `resolveClientIp`, then:

```ts
const clientIp = resolveClientIp({
  forwardedFor: input.request.headers.get("x-forwarded-for"),
  realIp: input.request.headers.get("x-real-ip"),
  trustedProxyHops: env.trustedProxyHops,
}) ?? "unknown"
```

Keep all existing HMAC/RPC code and scope policies unchanged.

- [ ] **Step 4: Run the entire rate-limit test file**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/rate-limit.ts tests/rate-limit.test.ts
git commit -m "fix: harden proxy-aware rate limiting"
```

### Task 4: KingHost rollout documentation

**Files:**
- Modify: `docs/deployment/kinghost.md`
- Modify: `docs/deployment/kinghost-sandbox.md`

- [ ] **Step 1: Document fail-safe default**

State that `RATE_LIMIT_TRUSTED_PROXY_HOPS=0` ignores forwarding IP headers and uses the shared `unknown` bucket. Before production, determine the actual KingHost reverse-proxy chain using a temporary diagnostic in the isolated sandbox or KingHost support documentation/support response; do not infer it from browser-supplied headers.

- [ ] **Step 2: Document sandbox acceptance**

Require tests from at least two independent client networks/IPs, confirm the expected rate-limit bucket isolation, then set the sandbox's verified hop count. Production must use the same count only if the production proxy topology is confirmed identical.

- [ ] **Step 3: Commit**

```bash
git add docs/deployment/kinghost.md docs/deployment/kinghost-sandbox.md
git commit -m "docs: define KingHost trusted proxy rollout"
```

### Task 5: Regression checkpoint

- [ ] **Step 1: Run focused API/auth/checkout tests**

```bash
node --experimental-strip-types --test \
  tests/rate-limit.test.ts \
  tests/checkout-route.test.ts \
  tests/shipping-quote.test.ts \
  tests/melhor-envio-oauth-routes.test.ts \
  tests/customer-auth.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full suite and KingHost build**

```bash
pnpm test
pnpm typecheck
pnpm build:kinghost
```

Expected: PASS.