# Shipping Checkout Hardening Execution Manifest

> **Continuity note (2026-08-31):** Before using this historical execution manifest, read `docs/superpowers/CURRENT_STATUS.md`. Live progress and the exact resume point are tracked there. The original static Melhor Envio bearer-token decision in **Resolution A** was later superseded by the approved single-account OAuth design/implementation in `docs/superpowers/specs/2026-08-29-melhor-envio-oauth-single-account-design.md` and `docs/superpowers/plans/2026-08-29-melhor-envio-oauth-single-account.md`. Do not revert the implemented OAuth lifecycle back to `MELHOR_ENVIO_ACCESS_TOKEN`.

**Status:** Final self-review completed on 2026-08-28. This manifest resolves the execution-level ambiguities found while reviewing the four detailed implementation plans. Where wording in a child plan could be read two ways, the exact decision below controls except where a later approved design explicitly supersedes it, as noted above.

**Spec:** `docs/superpowers/specs/2026-08-28-shipping-checkout-security-design.md`

**Detailed plans, in required order:**

1. `docs/superpowers/plans/2026-08-28-shipping-foundation.md`
2. `docs/superpowers/plans/2026-08-28-checkout-orders-shipping.md`
3. `docs/superpowers/plans/2026-08-28-payment-security-hardening.md`
4. `docs/superpowers/plans/2026-08-28-customer-copy-docs-rollout.md`

## Global execution rules

- Work only on `feat/checkout-mercadopago`; never merge `main` without explicit owner approval.
- Follow TDD for behavior changes: failing test, verify RED, minimal implementation, verify GREEN, commit.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build` at each plan completion gate.
- Do not log, commit, return, screenshot, or request in chat any Mercado Pago, Supabase, Melhor Envio, HMAC, or webhook secret.
- Melhor Envio remains quote-only. Label purchase stays manual.
- Browser input never controls product price, shipping metadata, freight amount, or final payment amount.
- Preview/Sandbox must pass end-to-end before Production configuration.

## Resolution A — Melhor Envio authentication for this single-store integration

**Historical decision — superseded on 2026-08-29.** The text below records the original first-release choice but is no longer the active authentication architecture. The active implementation uses the later approved single-account OAuth lifecycle referenced in the continuity note above.

Use a server-side Melhor Envio bearer token generated for the store account and configured as `MELHOR_ENVIO_ACCESS_TOKEN`. This is deliberate for the first single-merchant, quote-only release: there is no customer-facing multi-merchant authorization flow and no need to persist rotating OAuth refresh tokens in application storage.

The Sandbox application already created may remain for development/reference, but the quote-only implementation does not add an OAuth callback route unless current provider behavior proves the account token cannot perform the required quotation endpoint.

Before Production activation, verify in the current official Melhor Envio documentation/panel that the account-generated token is available for the Production account and note its expiration/rotation procedure in `docs/shipping-setup.md`. If the provider removes this supported token mode, stop Production rollout and design OAuth token persistence/refresh as a separate approved change rather than silently improvising it.

## Resolution B — exact internal/public shipping quote boundary

Plan 1 will use these exact interfaces in `lib/server/shipping-quote.ts`:

```ts
export interface PublicShippingOption {
  serviceId: string
  serviceName: string
  carrierName: string
  priceCents: number
  deliveryDays: number
  quoteToken: string
}

export interface TrustedShippingOption extends PublicShippingOption {
  packages: unknown[]
}

export interface ShippingQuoteResult {
  cartFingerprint: string
  options: TrustedShippingOption[]
}

export async function buildShippingQuoteResult(input: {
  items: unknown
  destinationCep: string
}): Promise<ShippingQuoteResult>

export function toPublicShippingOptions(
  result: ShippingQuoteResult,
): PublicShippingOption[]
```

`buildShippingQuoteResult` rebuilds the trusted cart, calls Melhor Envio, creates signed quote tokens, and retains the normalized `packages` array for server-side persistence. `/api/shipping/quote` must return only `toPublicShippingOptions(result)`; it must never expose `packages` or raw provider responses.

Plan 2 checkout revalidation calls `buildShippingQuoteResult`, finds the selected `serviceId`, compares the new `priceCents` with the signed token claim, and persists a server-owned `shipping_snapshot` containing the selected normalized carrier/service/price/ETA/packages plus the trusted product shipping inputs used for that quote.

No conditional route-test filename is used. Plan 1 creates exactly:

```text
tests/shipping-quote.test.ts
```

for the service logic, while the Next route stays deliberately thin.

## Resolution C — exact client IP handling for rate limiting

`lib/server/rate-limit.ts` extracts the candidate IP in this order:

1. `x-vercel-forwarded-for`
2. `x-forwarded-for`
3. `x-real-ip`
4. literal `unknown` when none is usable

For a comma-separated forwarding header, use the first trimmed value. Reject an empty value or a value longer than 64 characters; fall through to the next header. Never accept an IP from request JSON/query parameters.

Hash the selected value before storage:

```ts
createHmac("sha256", rateLimitSecret)
  .update(`${scope}:${clientIp}`)
  .digest("hex")
```

Only the HMAC bucket key is sent to Supabase. Raw IP is not written to the rate-limit table or application logs.

## Resolution D — exact checkout idempotency conflict behavior

`lib/server/orders.ts` adds a typed conflict:

```ts
export class OrderConflictError extends Error {
  constructor(public readonly code: "checkout_attempt_conflict") {
    super(code)
  }
}
```

When Supabase reports a unique violation for `checkout_attempt_id`, `createOrder` throws `OrderConflictError("checkout_attempt_conflict")` rather than converting it to a generic storage error.

Checkout behavior for an existing `checkoutAttemptId` is exact:

- same attempt ID + different `checkout_fingerprint` => HTTP `409`, no provider/payment call;
- same attempt ID + same fingerprint + non-empty `checkout_url` => return the existing order number/URL; do not create a new preference;
- same attempt ID + same fingerprint + no `checkout_url` => reuse that same existing order row and retry preference creation once in the current request; do not insert a second order;
- a concurrent unique-insert conflict triggers one reload by attempt ID and then follows the three rules above.

After a preference has been created successfully, persist both `preference_id` and `checkout_url` before returning success. A Mercado Pago network timeout can still leave an unreachable provider-side preference, but it cannot charge a customer and normal client retries remain bound to the same local order attempt.

## Resolution E — exact payment-ID uniqueness preflight

Before Plan 3 creates `orders_payment_id_uidx`, execute this exact read-only query in the development Supabase database:

```sql
select payment_id, count(*) as occurrences
from public.orders
where payment_id is not null
group by payment_id
having count(*) > 1;
```

Expected result: zero rows.

If any row is returned, stop the migration. Do not delete or rewrite rows automatically. Inspect the duplicate test records, determine which records are invalid/test artifacts, make an explicit correction, rerun the query, and create the unique index only after the result is empty.

## Resolution F — rollout tests for multi-product behavior

The live Preview/Sandbox acceptance test is exact for the current catalog:

- one current deck (`quantity=1`);
- two current decks (`quantity=2`).

Multi-product behavior is covered by automated tests using a controlled second-product fixture until a second real product is present in `data/products.ts`. The acceptance checklist must not block Production merely because the live catalog currently contains one product.

No README change is required by this project. Payment/provider setup lives in `docs/payments-setup.md` and `docs/shipping-setup.md`.

## Self-review result

### Spec coverage

Every approved requirement maps to one or more detailed plans:

- product-based freight, multiple quantities/products, carrier choice, quote revalidation: Plan 1 + Plan 2;
- complete address, subtotal/freight/total storage, idempotency, request limits, rate limiting: Plan 2;
- payment amount including freight, atomic webhook transitions, origin/redirect hardening, HTTP headers, Next.js security patch: Plan 3;
- trusted order display, stale copy cleanup, privacy/terms/refund pages, provider docs, Preview/Sandbox/Production rollout: Plan 4.

### Placeholder/ambiguity scan

The execution decisions that were previously conditional are fixed by Resolutions A-F above, subject to later approved superseding designs such as the Melhor Envio OAuth plan. There is no implementation-time choice left for provider quote boundaries, rate-limit IP precedence, duplicate checkout behavior, payment-ID uniqueness preflight, or live multi-product acceptance scope.

### Type consistency

Plan execution must use the exact `PublicShippingOption`, `TrustedShippingOption`, `ShippingQuoteResult`, `buildShippingQuoteResult`, `toPublicShippingOptions`, and `OrderConflictError` names/signatures in this manifest. Later tasks must import these interfaces rather than creating competing variants.

## Final planning gate

Planning is complete. Implementation may begin only after the user selects the execution mode. No source-code implementation had been performed by this planning sequence at the time this manifest was originally written. For live implementation status, always use `docs/superpowers/CURRENT_STATUS.md`.