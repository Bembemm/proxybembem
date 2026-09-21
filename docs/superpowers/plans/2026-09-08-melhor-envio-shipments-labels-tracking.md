# Phase 5 — Melhor Envio Shipments, Labels, DC-e/DACE and Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute this plan. Use superpowers:test-driven-development for implementation tasks and superpowers:verification-before-completion before any completion claim.

**Goal:** Add a production-capable, server-authoritative Melhor Envio shipment subsystem that supports a fixed PF/CPF sender, reviewed DC-e/DACE flow, explicit label purchase, separate label generation, printing, posting, cancellation, safe tracking reconciliation, and customer-visible tracking without automatic spending.

**Architecture:** Keep the existing Next.js + Supabase modular monolith. Add a dedicated shipment domain/repository/provider boundary, backend-only sender and shipment tables, database-backed operation claims for concurrency/idempotency, thin authenticated admin routes, and a curated customer shipment projection. Reuse the existing Melhor Envio OAuth/token manager, existing order snapshots, admin AAL2/session controls, order events, attention flags, audit log, and Vercel runtime.

**Tech Stack:** Next.js 16.3.3, React 19, TypeScript 5.7.3, Supabase/PostgreSQL/PostgREST, Melhor Envio OAuth/API, Node.js 22.x, pnpm 10, Node test runner, Vercel native deployment.

**Spec:** `docs/superpowers/specs/2026-09-08-melhor-envio-shipments-labels-tracking-design.md`

**Implementation branch:** `feat/admin-dashboard-expansion` (owner explicitly chose to continue Phase 5 on this branch).

## Global Constraints

- Follow TDD for each behavioral change: add/adjust a focused test first, run it RED for the intended reason, implement the smallest production change, rerun focused tests GREEN, then commit.
- Never call a real Melhor Envio spending endpoint from automated tests, build scripts, cron health checks, or page loads.
- Never auto-purchase a label after Mercado Pago approval, production completion, `ready_to_ship`, tracking refresh, deploy, or retry.
- `Comprar etiqueta` and `Gerar etiqueta` remain separate explicit admin operations.
- No label existence/generation/printing transition may mark the order `shipped`.
- Only explicit posting or trusted carrier acceptance may move `ready_to_ship -> shipped`; trusted delivery may move `shipped -> completed`.
- Preserve the exact checkout-selected Melhor Envio service id/name/carrier. No silent service substitution.
- V1 supports one active non-canceled shipment, one package, and one label per order. Canceled shipment history is retained.
- Build DC-e declaration lines from immutable/trusted order item title, quantity, and unit price. The browser cannot override quantity or money.
- Use the order's saved `shipping_snapshot` and item shipping snapshot; do not rebuild a historical shipment from the current product catalog.
- Require exactly one usable provider package snapshot for automated V1 preparation. If the saved quote package is absent, malformed, or multi-package, fail closed and surface admin attention instead of inventing dimensions or silently requoting.
- Fixed sender postal code must equal `SHIPPING_ORIGIN_CEP` so the label origin cannot silently differ from the checkout quote origin.
- Full CPF, OAuth tokens, authorization headers, raw provider payloads containing PII, and access-bearing label/DACE URLs must never appear in browser JSON, customer pages, audit metadata, or logs.
- Existing encrypted Melhor Envio OAuth credentials remain the only token authority. Do not put tokens in `shipments`.
- Existing Mercado Pago payment state remains provider-authoritative; shipment operations never forge payment status.
- New backend-only tables/RPCs must revoke browser-facing access and use least privilege. Prefer service-role `SELECT` plus `SECURITY DEFINER` mutation RPCs rather than broad direct table writes.
- Use existing same-origin, AAL2/admin-session, rate-limit, audit, order-event, and attention patterns.
- Direct Production rollout is staged. Implement and deploy non-spending paths first; purchase capability is fail-closed behind `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` until the owner explicitly enables it after non-spending validation.
- Re-check the current official Melhor Envio endpoint contracts and required OAuth scopes immediately before implementing each provider endpoint. If current docs contradict the approved spec, stop and reconcile the contract; do not broaden permissions speculatively.
- Do not merge, rebase, squash, force-move, or delete the branch without a separate explicit owner choice.

---

## Task 1: Record and enforce the Phase 5 OAuth scope grant

**Files:**
- Create: `lib/server/melhor-envio-oauth-scopes.ts`
- Create: `supabase/migrations/202609080002_melhor_envio_oauth_scope_grants.sql`
- Modify: `lib/server/melhor-envio-oauth-client.ts`
- Modify: `lib/server/melhor-envio-oauth-repository.ts`
- Modify: `lib/server/melhor-envio-token-manager.ts`
- Modify: `app/api/melhor-envio/oauth/callback/route.ts`
- Modify: `tests/melhor-envio-oauth-client.test.ts`
- Modify: `tests/melhor-envio-oauth-repository.test.ts`
- Modify: `tests/melhor-envio-token-manager.test.ts`
- Modify: `tests/melhor-envio-oauth-routes.test.ts`
- Create: `tests/melhor-envio-oauth-scope-migration.test.ts`

**Target interface:**

```ts
export const MELHOR_ENVIO_PHASE5_SCOPES = [
  "shipping-calculate",
  "cart-read",
  "cart-write",
  "orders-read",
  "shipping-checkout",
  "shipping-generate",
  "shipping-print",
  "shipping-tracking",
  "shipping-cancel",
] as const

export type MelhorEnvioOAuthScope = (typeof MELHOR_ENVIO_PHASE5_SCOPES)[number]

export function hasMelhorEnvioScopes(
  granted: readonly string[],
  required: readonly MelhorEnvioOAuthScope[],
): boolean
```

Extend credential records and usable token results with a normalized `authorizedScopes` array. Existing credentials created before this migration must truthfully default to quote-only scope `['shipping-calculate']`, forcing reauthorization before shipment mutations.

### Step 1: Write failing scope-contract tests

Cover:

```ts
test("authorization URL requests exactly the Phase 5 least-privilege scopes", async () => {})
test("legacy credential rows parse as quote-only after migration default", async () => {})
test("new authorization persists the exact requested scope set", async () => {})
test("token manager rejects a shipment operation when required scopes are absent", async () => {})
test("refresh preserves the already-authorized scope set", async () => {})
```

The authorization URL test must verify one `scope` parameter, no client secret, and exactly the approved scope set in the provider-documented delimiter/order.

### Step 2: Run focused tests and verify RED

```bash
pnpm test -- tests/melhor-envio-oauth-client.test.ts tests/melhor-envio-oauth-repository.test.ts tests/melhor-envio-token-manager.test.ts tests/melhor-envio-oauth-routes.test.ts tests/melhor-envio-oauth-scope-migration.test.ts
```

Expected: FAIL because the scope module/column/v2 authorization persistence do not exist and the OAuth URL still requests only `shipping-calculate`.

### Step 3: Add the safe migration

`202609080002_melhor_envio_oauth_scope_grants.sql` must:

- add `authorized_scopes text[] not null default array['shipping-calculate']::text[]` to `public.melhor_envio_oauth_credentials`;
- constrain it to a bounded non-empty array of lowercase/hyphen scope names with no duplicates;
- keep existing rows as quote-only rather than pretending old tokens gained permissions;
- add a new `upsert_melhor_envio_authorized_credential_v2(...)` RPC accepting `p_authorized_scopes text[]`;
- validate the scope array server-side;
- remain `SECURITY DEFINER`, `set search_path = ''`, browser roles revoked, `service_role` execute only;
- leave the old upsert RPC intact for rollback compatibility during migration-first rollout;
- not modify scope data during token refresh RPCs.

### Step 4: Implement the shared scope constant and authorization URL

Use a single scope constant from `melhor-envio-oauth-scopes.ts`. Do not duplicate the scope string in tests/routes. Build the authorization URL with the current provider-documented scope delimiter.

### Step 5: Persist and enforce granted scopes

- repository parses `authorized_scopes` strictly;
- callback uses the v2 upsert and stores the exact requested set after successful authorization;
- token manager accepts optional `requiredScopes` and rejects missing grants as `reauthorization_required` without exposing which token failed;
- quote path can require only `shipping-calculate` so old quote-only credentials remain functional until the owner reconnects.

### Step 6: Run focused tests and typecheck

```bash
pnpm test -- tests/melhor-envio-oauth-client.test.ts tests/melhor-envio-oauth-repository.test.ts tests/melhor-envio-token-manager.test.ts tests/melhor-envio-oauth-routes.test.ts tests/melhor-envio-oauth-scope-migration.test.ts
```

```bash
pnpm typecheck
```

Expected: PASS.

### Step 7: Commit

```bash
git add lib/server/melhor-envio-oauth-scopes.ts supabase/migrations/202609080002_melhor_envio_oauth_scope_grants.sql lib/server/melhor-envio-oauth-client.ts lib/server/melhor-envio-oauth-repository.ts lib/server/melhor-envio-token-manager.ts app/api/melhor-envio/oauth/callback/route.ts tests/melhor-envio-oauth-client.test.ts tests/melhor-envio-oauth-repository.test.ts tests/melhor-envio-token-manager.test.ts tests/melhor-envio-oauth-routes.test.ts tests/melhor-envio-oauth-scope-migration.test.ts
```

```bash
git commit -m "feat: record Melhor Envio OAuth scopes"
```

---

## Task 2: Add fail-closed label-purchase configuration and shipment rate limits

**Files:**
- Modify: `.env.example`
- Modify: `lib/server/env.ts`
- Modify: `lib/server/rate-limit.ts`
- Modify: `tests/melhor-envio-config-docs.test.ts`
- Modify: `tests/rate-limit.test.ts`
- Create: `tests/melhor-envio-shipment-env.test.ts`

**Target interface:**

```ts
export interface MelhorEnvioShipmentEnv extends MelhorEnvioOAuthEnv {
  labelPurchaseEnabled: boolean
}

export function getMelhorEnvioShipmentEnv(): MelhorEnvioShipmentEnv
```

Production purchase must be disabled unless:

```text
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=true
```

Missing/blank/invalid values must fail closed as `false` or configuration error; never treat arbitrary truthy strings as enabled.

Add rate-limit scopes:

```ts
| "admin-shipping-config"   // 10 / 10 min
| "admin-shipping-mutation" // 20 / 5 min
| "admin-shipping-spend"    // 5 / 5 min
```

### Step 1: Add RED tests

Cover exact boolean parsing and distinct HMAC rate buckets/policies. Assert `.env.example` documents `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` and never contains a real secret.

### Step 2: Run RED

```bash
pnpm test -- tests/melhor-envio-shipment-env.test.ts tests/rate-limit.test.ts tests/melhor-envio-config-docs.test.ts
```

### Step 3: Implement configuration and scopes

Keep `MELHOR_ENVIO_ENVIRONMENT=production` enforcement unchanged. Purchase flag only gates checkout/spend; it must not disable quote, sender config, preparation, tracking, printing, or OAuth reconnect.

### Step 4: Run GREEN + typecheck

```bash
pnpm test -- tests/melhor-envio-shipment-env.test.ts tests/rate-limit.test.ts tests/melhor-envio-config-docs.test.ts
```

```bash
pnpm typecheck
```

### Step 5: Commit

```bash
git add .env.example lib/server/env.ts lib/server/rate-limit.ts tests/melhor-envio-config-docs.test.ts tests/rate-limit.test.ts tests/melhor-envio-shipment-env.test.ts
```

```bash
git commit -m "feat: gate Melhor Envio label spending"
```

---

## Task 3: Create backend-only sender and shipment persistence

**Files:**
- Create: `supabase/migrations/202609080003_shipments_foundation.sql`
- Create: `lib/shipments/shipment.ts`
- Create: `tests/shipments-foundation-migration.test.ts`
- Create: `tests/shipment-domain.test.ts`

**Schema requirements:**

Create `public.shipping_sender_profiles` with one row per provider environment and fields for fixed PF sender data:

- `id uuid primary key default gen_random_uuid()`;
- `environment text unique` (`sandbox|production`);
- `person_type text` constrained to `pf` for current version;
- `full_name`, `cpf`, `email`, `phone`;
- postal/address fields;
- `version bigint > 0`;
- timestamps.

Create `public.shipments` with:

- local UUID and `order_id` FK `on delete restrict`;
- provider/environment/document mode;
- exact state enum/check from the approved spec;
- `stable_state_before_attention` nullable;
- selected service/carrier snapshots;
- customer-paid shipping cents, current provider cost cents, final purchased cost cents, BRL currency;
- immutable JSON snapshots: recipient, sender, package, declaration items;
- sender profile id/version;
- provider cart/shipment/order ids as bounded nullable text;
- tracking code/provider status/last tracking sync;
- attention reason;
- `operation_kind` and `operation_id` for database-backed claim correlation where needed;
- monotonically increasing `version`;
- timestamps.

Create `public.shipment_events` with local UUID, shipment/order FKs, event type, source, optional dedupe key, sanitized JSON metadata, timestamp.

Enforce:

```sql
create unique index ... on public.shipments(order_id)
where state <> 'canceled';
```

and a per-shipment dedupe rule for event fingerprints.

**Access model:** enable RLS; revoke all from `public, anon, authenticated`; grant only the minimum backend read privileges to `service_role`; mutations happen through later `SECURITY DEFINER` RPCs. Do not grant browser direct writes.

### Step 1: Write migration/domain tests RED

Tests must assert table constraints, one-active-shipment partial unique index, RLS/revokes, no broad browser grants, and exact state/document/provider sets.

Domain module exports strict constants/guards:

```ts
export const SHIPMENT_STATES = [
  "draft", "prepared", "in_cart", "purchase_pending", "purchased",
  "generation_pending", "generated", "posted", "in_transit", "delivered",
  "cancel_pending", "canceled", "attention_required",
] as const

export type ShipmentState = (typeof SHIPMENT_STATES)[number]
export type ShipmentDocumentMode = "declaration_content"
```

### Step 2: Run RED

```bash
pnpm test -- tests/shipments-foundation-migration.test.ts tests/shipment-domain.test.ts
```

### Step 3: Implement migration + pure domain guards

Use bounded lengths and JSON object/array constraints. Do not add NF-e UI/data requirements beyond a future-compatible document-mode shape; current persisted mode is `declaration_content`.

### Step 4: Run GREEN

```bash
pnpm test -- tests/shipments-foundation-migration.test.ts tests/shipment-domain.test.ts
```

```bash
pnpm typecheck
```

### Step 5: Commit

```bash
git add supabase/migrations/202609080003_shipments_foundation.sql lib/shipments/shipment.ts tests/shipments-foundation-migration.test.ts tests/shipment-domain.test.ts
```

```bash
git commit -m "feat: add shipment persistence foundation"
```

---

## Task 4: Build and validate the trusted shipment snapshot

**Files:**
- Modify: `lib/server/admin-orders.ts`
- Create: `lib/server/shipment-snapshot.ts`
- Create: `tests/shipment-snapshot.test.ts`
- Modify: `tests/admin-orders.test.ts`

**Target behavior:**

`getAdminOrderById()` must include `shipping_snapshot` as untrusted stored JSON so the shipment builder can validate it. Do not expose it to a client component as authority.

Create:

```ts
export interface ShipmentPreparationSnapshot {
  service: { id: string; name: string; carrier: string }
  customerShippingCents: number
  recipient: { /* exact normalized order destination fields */ }
  package: { /* one provider-compatible saved quote volume */ }
  declarationItems: Array<{
    productId: number
    description: string
    quantity: number
    unitValueCents: number
  }>
}

export function buildShipmentPreparationSnapshot(input: {
  order: AdminOrderDetail
  sender: ShippingSenderProfile
  expectedOriginCep: string
}): ShipmentPreparationSnapshot
```

Rules:

- order must be `payment_status === 'approved'` and `fulfillment_status === 'ready_to_ship'`;
- `shipping_provider === 'melhor_envio'`;
- exact service id/name/carrier comes from order snapshot and must agree with top-level order shipping fields;
- sender postal code equals `SHIPPING_ORIGIN_CEP`;
- recipient address/CEP is complete;
- declaration comes from immutable order item title/qty/unit cents;
- total declaration value is recomputed server-side;
- use saved quote `shipping_snapshot.packages` only;
- require exactly one package and validate provider dimensions/weight/insurance fields according to the current official quote response contract;
- zero, multiple, malformed, or inconsistent packages throw a typed safe error such as `ShipmentSnapshotError("multiple_packages_not_supported")` or `("shipping_package_snapshot_invalid")`;
- never re-resolve current catalog price/dimensions and never accept browser overrides.

### Step 1: Add RED tests

Cover valid one-package snapshot, old product/catalog changes not affecting order snapshot, malformed/missing package, multi-package rejection, service mismatch, sender-origin mismatch, unpaid/not-ready order, bad recipient, and declaration cents/quantity integrity.

### Step 2: Run RED

```bash
pnpm test -- tests/shipment-snapshot.test.ts tests/admin-orders.test.ts
```

### Step 3: Implement minimal builder

Keep package parsing isolated so a provider quote-shape change affects one module/test fixture.

### Step 4: Run GREEN + typecheck

```bash
pnpm test -- tests/shipment-snapshot.test.ts tests/admin-orders.test.ts
```

```bash
pnpm typecheck
```

### Step 5: Commit

```bash
git add lib/server/admin-orders.ts lib/server/shipment-snapshot.ts tests/shipment-snapshot.test.ts tests/admin-orders.test.ts
```

```bash
git commit -m "feat: build trusted shipment snapshots"
```

---

## Task 5: Implement fixed PF/CPF sender persistence and protected admin editing

**Files:**
- Create: `lib/server/shipping-sender.ts`
- Create: `lib/server/admin-shipping-sender-action.ts`
- Create: `app/api/internal/admin/integrations/melhor-envio/sender/route.ts`
- Modify: `app/admin/integrations/melhor-envio/page.tsx`
- Create: `components/admin/melhor-envio-sender-form.tsx`
- Modify: `supabase/migrations/202609080003_shipments_foundation.sql` only if the migration has not yet been applied; otherwise create a follow-up migration rather than rewriting applied history.
- Create: `tests/shipping-sender.test.ts`
- Create: `tests/admin-shipping-sender-action.test.ts`
- Modify: `tests/admin-shell.test.ts` only if existing integration-page assertions require it.

**Repository/operation interface:**

```ts
export interface ShippingSenderProfile {
  id: string
  environment: "sandbox" | "production"
  fullName: string
  cpf: string
  email: string
  phone: string
  postalCode: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  version: number
  updatedAt: string
}

export async function getShippingSenderProfile(environment): Promise<ShippingSenderProfile | null>
export async function upsertShippingSenderProfile(input): Promise<ShippingSenderProfile>
export function maskCpf(cpf: string): string
```

Use a dedicated service-role-only `SECURITY DEFINER` upsert RPC that validates expected version for updates, increments version, and writes an `admin_audit_log` entry containing only safe non-CPF change metadata. The server action must normalize CPF/phone/CEP, validate Brazilian CPF checksum, validate state/address bounds, and require profile CEP = `SHIPPING_ORIGIN_CEP`.

### Step 1: Write RED tests

Cover CPF checksum, normalization, masked read, optimistic update conflict, origin CEP mismatch, same-origin enforcement before auth/storage, AAL2/admin session requirement, rate limit, no full CPF in feedback/error/audit test doubles.

### Step 2: Run RED

```bash
pnpm test -- tests/shipping-sender.test.ts tests/admin-shipping-sender-action.test.ts
```

### Step 3: Implement repository/RPC and action route

Use `admin-shipping-config` rate limit. The browser posts form fields, but all validation and authoritative environment/origin checks happen server-side.

### Step 4: Add integration-page form

Show current environment, connection status, fixed sender summary, masked CPF, and form. Do not render full stored CPF back into the page after save; require explicit replacement if CPF changes.

### Step 5: Run GREEN + build

```bash
pnpm test -- tests/shipping-sender.test.ts tests/admin-shipping-sender-action.test.ts
```

```bash
pnpm typecheck
```

```bash
pnpm build
```

### Step 6: Commit

```bash
git add lib/server/shipping-sender.ts lib/server/admin-shipping-sender-action.ts app/api/internal/admin/integrations/melhor-envio/sender/route.ts app/admin/integrations/melhor-envio/page.tsx components/admin/melhor-envio-sender-form.tsx tests/shipping-sender.test.ts tests/admin-shipping-sender-action.test.ts supabase/migrations
```

```bash
git commit -m "feat: add protected Melhor Envio sender profile"
```

---

## Task 6: Add the strict Melhor Envio shipment provider client

**Files:**
- Create: `lib/server/melhor-envio-shipment-client.ts`
- Create: `tests/melhor-envio-shipment-client.test.ts`
- Modify: `lib/server/melhor-envio.ts` only for shared transport/auth helpers if duplication would otherwise be unsafe; do not mix shipment orchestration into the quote function.

**Before coding:** re-open the current official Melhor Envio docs for cart insertion, cart/order read used for reconciliation, checkout, generation, printing, DACE, tracking, and cancellation. Confirm request paths, request/response shapes, and endpoint-specific scopes against the approved scope list.

**Target interface:**

```ts
export class MelhorEnvioShipmentProviderError extends Error {
  status: number | null
  classification:
    | "unauthenticated"
    | "definite_rejection"
    | "outcome_unknown"
    | "invalid_response"
}

export async function addShipmentToMelhorEnvioCart(input): Promise<{
  providerShipmentId: string
  currentCostCents: number
}>

export async function purchaseMelhorEnvioShipment(input): Promise<{
  providerOrderId: string
  purchasedCostCents: number
}>

export async function generateMelhorEnvioShipment(input): Promise<{ accepted: true }>
export async function readMelhorEnvioShipment(input): Promise<ProviderShipmentState>
export async function getMelhorEnvioPrintResource(input): Promise<ProviderPrintResource>
export async function getMelhorEnvioDaceResource(input): Promise<ProviderPrintResource>
export async function trackMelhorEnvioShipments(input): Promise<ProviderTrackingResult[]>
export async function cancelMelhorEnvioShipment(input): Promise<ProviderCancellationResult>
```

**Provider request requirements:**

- use existing token manager with endpoint-specific required scopes;
- exactly one retry is allowed only for recognized authentication failure after obtaining a newer token version, matching the quote-client pattern;
- no retry for checkout/purchase after network timeout, connection loss, or ambiguous provider 5xx;
- classify validation/rejection responses that prove no purchase as `definite_rejection`;
- classify timeout/network/ambiguous server result as `outcome_unknown`;
- parse success bodies strictly and bound strings/arrays/bytes;
- build cart `from` with PF/CPF and no invoice for `declaration_content`;
- send provider-compatible empty/`ISENTO` state registration behavior per current docs;
- use complete trusted declaration products and exactly the saved one-volume package;
- no raw provider body logging;
- User-Agent, Bearer token, no-store, timeout required.

### Step 1: Write comprehensive RED tests with fake fetch/token manager

Cover exact URLs/methods/headers, PF/DC-e payload, no invoice, saved volume preservation, current cost parsing, strict success validation, authentication refresh, timeout classification, definite 4xx rejection, ambiguous 5xx handling, checkout no blind retry, generation/print/tracking/cancel parsing, and secret/CPF-safe logged-error contract.

### Step 2: Run RED

```bash
pnpm test -- tests/melhor-envio-shipment-client.test.ts
```

### Step 3: Implement the provider boundary only

No route/UI/database orchestration in this module. Keep each endpoint as a small function sharing a bounded authenticated request helper.

### Step 4: Run GREEN + existing quote/token tests

```bash
pnpm test -- tests/melhor-envio-shipment-client.test.ts tests/melhor-envio.test.ts tests/melhor-envio-token-manager.test.ts
```

```bash
pnpm typecheck
```

### Step 5: Commit

```bash
git add lib/server/melhor-envio-shipment-client.ts lib/server/melhor-envio.ts tests/melhor-envio-shipment-client.test.ts
```

```bash
git commit -m "feat: add Melhor Envio shipment client"
```

---

## Task 7: Add atomic shipment mutation RPCs and repository wrappers

**Files:**
- Create: `supabase/migrations/202609080004_shipment_operations.sql`
- Create: `lib/server/shipments.ts`
- Create: `lib/server/shipment-operations.ts`
- Create: `tests/shipment-operations-migration.test.ts`
- Create: `tests/shipments-repository.test.ts`
- Create: `tests/shipment-operations.test.ts`

**Database operations:**

Implement narrowly validated `SECURITY DEFINER` RPCs (exact names can match the list below and should remain stable once tests are written):

```text
admin_create_shipment_draft
admin_claim_shipment_prepare
admin_commit_shipment_cart
admin_revert_shipment_prepare
admin_claim_shipment_purchase
admin_commit_shipment_purchase
admin_revert_shipment_purchase
admin_mark_shipment_attention
admin_resolve_shipment_reconciliation
admin_claim_shipment_generation
admin_commit_shipment_generation
admin_claim_shipment_cancel
admin_commit_shipment_cancel
admin_confirm_shipment_posting
shipment_apply_tracking_update
```

Each RPC must:

- lock the shipment/order row with `FOR UPDATE` where relevant;
- validate current state and expected version;
- use an operation UUID for claim/commit correlation where an external call sits between them;
- enforce the one-active-shipment rule;
- write append-only shipment/order events as part of the same local transaction;
- write `admin_audit_log` for sensitive admin operations using sanitized metadata;
- never accept browser-provided payment state, customer id, provider environment, service substitution, or arbitrary next state;
- preserve the last stable state when entering `attention_required`;
- never automatically clear `purchase_outcome_unknown` without an explicit reconciliation result;
- give `service_role` execute only and revoke browser roles.

**Important purchase rule:** `in_cart -> purchase_pending` is a durable claim. If the process crashes after the provider request may have been sent, another request sees `purchase_pending`/attention and cannot perform checkout again. There is no expiring in-memory/DB lease that silently re-enables spend.

### Step 1: Write SQL and wrapper tests RED

Prove allowed/forbidden transitions, expected-version conflict, operation-id mismatch, one active shipment, no duplicate purchase claim, generation not changing order fulfillment, cancellation not canceling the order, posting atomically changes eligible order to `shipped`, tracking delivery only changes eligible `shipped -> completed`.

### Step 2: Run RED

```bash
pnpm test -- tests/shipment-operations-migration.test.ts tests/shipments-repository.test.ts tests/shipment-operations.test.ts
```

### Step 3: Implement SQL and strict TypeScript parsers

Follow the existing `admin-order-operations.ts` pattern: exact RPC arguments, strict result schema, generic storage logs containing only operation/status.

### Step 4: Run GREEN + existing order operation tests

```bash
pnpm test -- tests/shipment-operations-migration.test.ts tests/shipments-repository.test.ts tests/shipment-operations.test.ts tests/admin-order-operations.test.ts tests/admin-order-actions.test.ts
```

```bash
pnpm typecheck
```

### Step 5: Commit

```bash
git add supabase/migrations/202609080004_shipment_operations.sql lib/server/shipments.ts lib/server/shipment-operations.ts tests/shipment-operations-migration.test.ts tests/shipments-repository.test.ts tests/shipment-operations.test.ts
```

```bash
git commit -m "feat: add atomic shipment operations"
```

---

## Task 8: Implement shipment preparation with DC-e review and cart insertion

**Files:**
- Create: `lib/server/shipment-service.ts`
- Create: `lib/server/admin-shipment-actions.ts`
- Create: `app/api/internal/admin/orders/[id]/shipment/prepare/route.ts`
- Create: `tests/shipment-service-prepare.test.ts`
- Create: `tests/admin-shipment-actions.test.ts`

**Preparation service:**

```ts
export async function prepareAdminShipment(input: {
  orderId: string
  adminUserId: string
}): Promise<ShipmentActionResult>
```

Flow:

1. load trusted admin order + fixed sender + existing active shipment;
2. build/validate snapshot;
3. create/update only an eligible pre-purchase draft;
4. atomically claim preparation;
5. call provider cart insertion using exact selected service, CPF/DC-e items, saved package;
6. on success, commit `in_cart`, provider id, and current provider cost;
7. on a definite rejection, revert to safe pre-cart state and expose sanitized feedback;
8. on uncertain result, enter `attention_required` with reason `cart_outcome_unknown`; do not create a second provider cart item automatically.

The review page itself performs no provider write. `Preparar remessa` is the explicit write.

### Step 1: Write RED service/action tests

Cover happy path, missing sender, missing scopes, malformed/multi-package snapshot, wrong service, wrong order state, definite provider rejection, unknown outcome, concurrent/busy claim, same-origin/auth/rate limit, no browser-controlled declaration values.

### Step 2: Run RED

```bash
pnpm test -- tests/shipment-service-prepare.test.ts tests/admin-shipment-actions.test.ts
```

### Step 3: Implement service and protected route

Use `admin-shipping-mutation` rate limit. Return private/no-store and fixed redirect feedback codes to `/admin/pedidos/[id]`.

### Step 4: Run GREEN + typecheck

```bash
pnpm test -- tests/shipment-service-prepare.test.ts tests/admin-shipment-actions.test.ts
```

```bash
pnpm typecheck
```

### Step 5: Commit

```bash
git add lib/server/shipment-service.ts lib/server/admin-shipment-actions.ts app/api/internal/admin/orders/[id]/shipment/prepare/route.ts tests/shipment-service-prepare.test.ts tests/admin-shipment-actions.test.ts
```

```bash
git commit -m "feat: prepare Melhor Envio shipments"
```

---

## Task 9: Implement explicit label purchase and uncertain-outcome reconciliation

**Files:**
- Modify: `lib/server/shipment-service.ts`
- Create: `app/api/internal/admin/shipments/[id]/purchase/route.ts`
- Create: `app/api/internal/admin/shipments/[id]/reconcile/route.ts`
- Create: `tests/shipment-service-purchase.test.ts`
- Modify: `tests/admin-shipment-actions.test.ts`

**Purchase interface:**

```ts
export async function purchaseAdminShipment(input: {
  shipmentId: string
  adminUserId: string
  expectedCostCents: number
}): Promise<ShipmentActionResult>

export async function reconcileAdminShipmentPurchase(input: {
  shipmentId: string
  adminUserId: string
}): Promise<ShipmentActionResult>
```

The posted `expectedCostCents` is only a confirmation token/value; the server reloads the shipment/provider state and requires it to equal the trusted current cost immediately before claiming spend.

Flow:

1. require `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED === true`;
2. require production environment banner/record consistency;
3. reload provider/cart data using current documented `cart-read`/`orders-read` path and refresh current cost;
4. if cost changed, do **not** buy; update/show new cost and require a fresh explicit confirmation;
5. atomically claim `in_cart -> purchase_pending`;
6. call checkout exactly once;
7. success -> `purchased` + final purchased cost/provider order id;
8. definite rejection proving no purchase -> safe `in_cart` retryable state with rejection event;
9. network timeout/connection loss/ambiguous server result -> `attention_required` / `purchase_outcome_unknown`; never retry checkout;
10. reconciliation reads provider state only and resolves to confirmed `purchased`, confirmed-not-purchased `in_cart`, or remains attention; it never spends.

### Step 1: Write RED tests

Prove purchase disabled by default, cost-change reconfirmation, one checkout call under concurrent/double request, no retry on timeout, second spend blocked in attention, reconciliation confirmed-purchased, reconciliation confirmed-not-purchased, unresolved ambiguity, exact admin id/audit amount/environment, no secret/CPF leak.

### Step 2: Run RED

```bash
pnpm test -- tests/shipment-service-purchase.test.ts tests/admin-shipment-actions.test.ts
```

### Step 3: Implement purchase and reconciliation routes

Purchase uses `admin-shipping-spend` rate limit; reconciliation uses `admin-shipping-mutation`. Both require same-origin + active AAL2 admin. Purchase route accepts only bounded confirmation input; no provider ids/service ids from browser.

### Step 4: Run GREEN + typecheck

```bash
pnpm test -- tests/shipment-service-purchase.test.ts tests/admin-shipment-actions.test.ts
```

```bash
pnpm typecheck
```

### Step 5: Commit

```bash
git add lib/server/shipment-service.ts app/api/internal/admin/shipments/[id]/purchase/route.ts app/api/internal/admin/shipments/[id]/reconcile/route.ts tests/shipment-service-purchase.test.ts tests/admin-shipment-actions.test.ts
```

```bash
git commit -m "feat: purchase labels with safe reconciliation"
```

---

## Task 10: Implement separate label generation and protected print resources

**Files:**
- Modify: `lib/server/shipment-service.ts`
- Create: `app/api/internal/admin/shipments/[id]/generate/route.ts`
- Create: `app/api/internal/admin/shipments/[id]/print-label/route.ts`
- Create: `app/api/internal/admin/shipments/[id]/print-dace/route.ts`
- Create: `tests/shipment-service-generation.test.ts`
- Create: `tests/shipment-print-routes.test.ts`

**Rules:**

- generation only from confirmed `purchased` and requires explicit POST;
- claim `generation_pending` before provider call;
- provider acknowledgement alone does not invent print readiness; read/reconcile provider state until documented generated state is confirmed;
- generation never changes `orders.fulfillment_status`;
- label/DACE routes are authenticated admin GET/POST routes with no-store and never customer-visible;
- server obtains the current provider print/DACE resource on demand; do not persist access-bearing URLs;
- validate provider host/resource before redirecting/streaming;
- DACE is available only for `declaration_content` shipment when provider state permits it.

### Step 1: Write RED tests

Cover generation before purchase blocked, separate purchase/generate, pending/idempotent behavior, uncertain generation requiring read reconciliation, generated still leaves order ready_to_ship, print route auth, no print URL in ordinary shipment JSON, malformed provider URL blocked.

### Step 2: Run RED

```bash
pnpm test -- tests/shipment-service-generation.test.ts tests/shipment-print-routes.test.ts
```

### Step 3: Implement generation + print routes

Use `admin-shipping-mutation` rate limit for generation. Print read may use auth/session plus a bounded non-spending rate limit; do not introduce a client-accessible permanent token.

### Step 4: Run GREEN + build

```bash
pnpm test -- tests/shipment-service-generation.test.ts tests/shipment-print-routes.test.ts
```

```bash
pnpm typecheck
```

```bash
pnpm build
```

### Step 5: Commit

```bash
git add lib/server/shipment-service.ts app/api/internal/admin/shipments/[id]/generate/route.ts app/api/internal/admin/shipments/[id]/print-label/route.ts app/api/internal/admin/shipments/[id]/print-dace/route.ts tests/shipment-service-generation.test.ts tests/shipment-print-routes.test.ts
```

```bash
git commit -m "feat: generate and print shipping labels"
```

---

## Task 11: Implement posting and label cancellation

**Files:**
- Modify: `lib/server/shipment-service.ts`
- Create: `app/api/internal/admin/shipments/[id]/post/route.ts`
- Create: `app/api/internal/admin/shipments/[id]/cancel/route.ts`
- Create: `tests/shipment-service-post-cancel.test.ts`
- Modify: `tests/admin-shipment-actions.test.ts`

**Posting rules:**

- explicit admin action only;
- only eligible generated/purchased provider state may be posted according to current provider lifecycle;
- atomically transition shipment `posted` and order `ready_to_ship -> shipped` through the dedicated RPC;
- idempotent if trusted tracking already posted it;
- does not alter payment state.

**Cancellation rules:**

- explicit strong confirmation only;
- never automatic;
- claim `cancel_pending` before provider request;
- provider-confirmed cancellation -> `canceled`, keep history, permit a future replacement shipment for that order if fulfillment still eligible;
- provider rejection -> preserve provider/local state, no fake refund;
- uncertain outcome -> attention and reconciliation/read before another cancellation attempt;
- shipment cancellation never cancels the customer order.

### Step 1: Write RED tests

Cover posting atomic order transition, posting after already-tracked acceptance idempotent, generated label not auto-posted, cancellation preconditions, confirmed cancel, reject, unknown, replacement uniqueness behavior, and no order/payment cancellation side effects.

### Step 2: Run RED

```bash
pnpm test -- tests/shipment-service-post-cancel.test.ts tests/admin-shipment-actions.test.ts
```

### Step 3: Implement routes/service

Use `admin-shipping-mutation` rate limit and admin AAL2/origin checks. Cancellation confirmation must come from the UI but server revalidates eligibility independently.

### Step 4: Run GREEN

```bash
pnpm test -- tests/shipment-service-post-cancel.test.ts tests/admin-shipment-actions.test.ts tests/admin-order-operations.test.ts
```

```bash
pnpm typecheck
```

### Step 5: Commit

```bash
git add lib/server/shipment-service.ts app/api/internal/admin/shipments/[id]/post/route.ts app/api/internal/admin/shipments/[id]/cancel/route.ts tests/shipment-service-post-cancel.test.ts tests/admin-shipment-actions.test.ts
```

```bash
git commit -m "feat: post and cancel Melhor Envio shipments"
```

---

## Task 12: Add monotonic tracking reconciliation and internal hourly refresh

**Files:**
- Create: `lib/server/shipment-tracking.ts`
- Create: `lib/server/melhor-envio-tracking-handler.ts`
- Create: `app/api/internal/melhor-envio/tracking/route.ts`
- Create: `tests/shipment-tracking.test.ts`
- Create: `tests/melhor-envio-tracking-handler.test.ts`

**Target behavior:**

```ts
export async function refreshShipmentTracking(input: {
  shipmentId: string
}): Promise<TrackingRefreshResult>

export async function refreshActiveShipmentTrackingBatch(input: {
  limit: number
}): Promise<{ checked: number; changed: number; attention: number }>
```

Tracking mapping is an explicit allowlist. Define normalized classes such as:

```text
pre_posting
posted
in_transit
delivered
canceled
unknown
```

Map current provider states to those classes only after checking current official docs. Unknown provider state is retained/surfaced to admin attention and does not invent an order transition.

Rules:

- dedupe provider tracking events with deterministic fingerprint;
- stale responses cannot move local shipment/order backwards;
- trusted posted/acceptance may move eligible `ready_to_ship -> shipped`;
- trusted delivery may move eligible `shipped -> completed`;
- cancellation tracking cannot silently cancel the customer order;
- read-only tracking route never invokes cart/checkout/generate/cancel;
- internal route uses existing `CRON_SECRET` timing-safe pattern and returns only counts/boolean, no tracking code lists/PII;
- batch is bounded (for example max 50 per invocation) and no generalized queue is added.

Operational cadence after rollout: Vercel cron once per hour. Existing OAuth refresh cron remains daily at 03:17.

### Step 1: Write RED tests

Cover known status mappings, unknown state attention, dedupe, stale/backward protection, posted/order transition, delivered/completed, ownership-independent server batch, cron auth, bounded batch, and explicit assertion that checkout client is never called.

### Step 2: Run RED

```bash
pnpm test -- tests/shipment-tracking.test.ts tests/melhor-envio-tracking-handler.test.ts
```

### Step 3: Implement tracker and cron handler

Use existing token manager and `shipping-tracking` only. Keep the handler easy to invoke manually for diagnostics without exposing shipment detail.

### Step 4: Run GREEN + typecheck

```bash
pnpm test -- tests/shipment-tracking.test.ts tests/melhor-envio-tracking-handler.test.ts
```

```bash
pnpm typecheck
```

### Step 5: Commit

```bash
git add lib/server/shipment-tracking.ts lib/server/melhor-envio-tracking-handler.ts app/api/internal/melhor-envio/tracking/route.ts tests/shipment-tracking.test.ts tests/melhor-envio-tracking-handler.test.ts
```

```bash
git commit -m "feat: reconcile Melhor Envio tracking"
```

---

## Task 13: Expose only sanitized tracking to the owning customer

**Files:**
- Create: `supabase/migrations/202609080005_customer_shipment_projection.sql`
- Modify: `lib/server/customer-orders.ts`
- Modify: `app/minha-conta/pedidos/[id]/page.tsx`
- Modify: `tests/customer-orders.test.ts`
- Create: `tests/customer-shipment-projection-migration.test.ts`
- Modify/Create: the focused customer order page contract test if one already covers this page.

**Customer projection shape:**

```ts
shipment: null | {
  carrierName: string
  serviceName: string
  trackingCode: string | null
  status: "preparing" | "posted" | "in_transit" | "delivered" | "canceled" | "attention"
  updatedAt: string
  timeline: Array<{
    kind: "posted" | "in_transit" | "delivered"
    createdAt: string
  }>
}
```

The SQL RPC replacement must continue deriving ownership from `auth.uid()` and return null for another user's order. It may join the one active/current shipment and shipment events, but must not expose:

- provider cart/order/internal ids;
- actual label cost or shipping margin/difference;
- sender profile/CPF;
- admin ids/audit;
- OAuth data;
- print/DACE links;
- raw provider status/payload.

### Step 1: Write RED projection/parser/page tests

Add exact-key tests proving the sanitized shape and rejection of extra sensitive keys. Add ownership migration contract assertions and public timeline dedupe/order.

### Step 2: Run RED

```bash
pnpm test -- tests/customer-orders.test.ts tests/customer-shipment-projection-migration.test.ts
```

### Step 3: Replace `customer_get_order` via new migration

Do not rewrite already-applied `202609020003_customer_accounts_orders.sql`. Recreate the function in the new migration with fixed search path, authenticated execute only, same ownership boundary plus shipment projection.

### Step 4: Update TypeScript parser and page

Add a compact `Rastreamento` block under Delivery only when shipment data exists. Show tracking code, carrier/service, friendly state, timeline dates. Do not create a public unauthenticated tracking endpoint.

### Step 5: Run GREEN + build

```bash
pnpm test -- tests/customer-orders.test.ts tests/customer-shipment-projection-migration.test.ts
```

```bash
pnpm typecheck
```

```bash
pnpm build
```

### Step 6: Commit

```bash
git add supabase/migrations/202609080005_customer_shipment_projection.sql lib/server/customer-orders.ts app/minha-conta/pedidos/[id]/page.tsx tests/customer-orders.test.ts tests/customer-shipment-projection-migration.test.ts
```

```bash
git commit -m "feat: show customer shipment tracking"
```

---

## Task 14: Build the admin shipment panel and explicit confirmations

**Files:**
- Create: `components/admin/shipment-panel.tsx`
- Create: `components/admin/shipment-confirm-action.tsx`
- Modify: `app/admin/pedidos/[id]/page.tsx`
- Modify: `lib/server/shipments.ts` if an admin projection reader is not already present.
- Create: `tests/admin-shipment-ui.test.ts`

**UI states:**

The panel must render from trusted server projections and show only actions allowed by current state:

```text
ready_to_ship + no shipment:
  Revisar envio / DC-e -> Preparar remessa

in_cart:
  Cliente pagou R$ X
  Etiqueta agora R$ Y
  Diferença (loja paga +R$ / margem +R$)
  Comprar etiqueta por R$ Y

purchase_pending / attention_required:
  Compra em verificação
  Reconciliar compra
  no purchase button

purchased:
  Gerar etiqueta

generation_pending:
  Geração em andamento / atualizar estado

generated:
  Imprimir etiqueta
  Imprimir DACE
  Confirmar postagem
  Cancelar etiqueta when provider state permits

posted / in_transit / delivered:
  tracking code/status/history; no purchase/generation actions

canceled:
  canceled history; a new shipment may be prepared only if order remains eligible
```

**Purchase confirmation:** use a dedicated dialog that states `Production`, exact label amount, customer-paid amount, and difference. Submit only shipment id from route plus the expected current cost confirmation; server ignores any client provider/service values.

**Cancellation confirmation:** strong warning using danger styling, current state, and provider refund/cancellation caveat.

No autosave, no action on page load, no JS fetch that purchases automatically.

### Step 1: Write RED UI contract tests

Assert action visibility by state, explicit separate labels for purchase/generate, price difference copy, Production warning, attention state blocking purchase, no `mark-shipped` side effect from generation, masked sender CPF, and no sensitive provider ids/tokens/print links embedded in ordinary page HTML.

### Step 2: Run RED

```bash
pnpm test -- tests/admin-shipment-ui.test.ts
```

### Step 3: Implement panel/components

Keep `app/admin/pedidos/[id]/page.tsx` server-rendered and protected. Load shipment projection alongside existing order events/audit/attention. Use client dialog component only for confirmation UX.

### Step 4: Run GREEN + admin regressions

```bash
pnpm test -- tests/admin-shipment-ui.test.ts tests/admin-order-actions.test.ts tests/admin-shell.test.ts
```

```bash
pnpm typecheck
```

```bash
pnpm build
```

### Step 5: Commit

```bash
git add components/admin/shipment-panel.tsx components/admin/shipment-confirm-action.tsx app/admin/pedidos/[id]/page.tsx lib/server/shipments.ts tests/admin-shipment-ui.test.ts
```

```bash
git commit -m "feat: add admin shipment workflow UI"
```

---

## Task 15: Add cross-module security and no-spend regression tests

**Files:**
- Create: `tests/shipment-security-regression.test.ts`
- Create: `tests/shipment-no-auto-spend.test.ts`
- Modify: `tests/safe-metadata.test.ts` if shipment-specific forbidden metadata needs explicit coverage.
- Modify: provider/action tests only if failures expose a gap.

### Step 1: Write the regression matrix

Prove across modules/routes:

- unauthenticated/non-admin cannot prepare/purchase/generate/post/cancel;
- admin without AAL2/active session cannot mutate/spend;
- cross-origin mutation is rejected before provider/storage work;
- purchase route rate-limits independently;
- `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` guarantees zero provider checkout calls;
- payment webhook never imports/calls shipment purchase;
- `ready_to_ship` operation never imports/calls shipment purchase;
- tracking cron never imports/calls checkout/generate/cancel;
- page rendering never imports/calls checkout;
- checkout timeout path invokes provider checkout once total;
- generation never changes fulfillment;
- customer order projection cannot contain CPF/cost/provider ids/tokens/print links;
- logs/error metadata use safe identifiers only;
- no module exposes raw access/refresh token to client code.

### Step 2: Run RED if any gap is found

```bash
pnpm test -- tests/shipment-security-regression.test.ts tests/shipment-no-auto-spend.test.ts
```

### Step 3: Fix only demonstrated gaps

Do not refactor unrelated auth/payment code.

### Step 4: Run full focused security set

```bash
pnpm test -- tests/shipment-security-regression.test.ts tests/shipment-no-auto-spend.test.ts tests/admin-shipment-actions.test.ts tests/melhor-envio-shipment-client.test.ts tests/customer-orders.test.ts
```

```bash
pnpm typecheck
```

### Step 5: Commit

```bash
git add tests/shipment-security-regression.test.ts tests/shipment-no-auto-spend.test.ts tests/safe-metadata.test.ts lib app components
```

```bash
git commit -m "test: harden shipment security boundaries"
```

---

## Task 16: Apply new Supabase migrations in order and validate least privilege

**Files:**
- No new code unless validation finds a defect. Never rewrite already-applied migration history.

**Migrations to apply once, in order:**

```text
202609080002_melhor_envio_oauth_scope_grants.sql
202609080003_shipments_foundation.sql
202609080004_shipment_operations.sql
202609080005_customer_shipment_projection.sql
```

Before applying, verify each filename is not already present in hosted migration history under another timestamp/name. Apply only unapplied changes.

### Step 1: Run migration contract tests locally/CI first

```bash
pnpm test -- tests/melhor-envio-oauth-scope-migration.test.ts tests/shipments-foundation-migration.test.ts tests/shipment-operations-migration.test.ts tests/customer-shipment-projection-migration.test.ts
```

### Step 2: Apply migrations to hosted Supabase

Use the connected Supabase tooling available in the execution environment. If no Supabase write connector is available, stop and give the owner the exact migration/apply step rather than guessing or marking it applied.

### Step 3: Validate live schema/ACLs

Verify:

- tables/RLS/partial unique indexes/check constraints exist;
- `anon`/`authenticated` have no direct sender/shipment write/read privileges except `customer_get_order` execute as designed;
- service role has only intended table reads and RPC execute privileges;
- mutation RPCs are SECURITY DEFINER + fixed search_path + browser execute revoked;
- legacy OAuth credentials are recorded quote-only until reauthorization;
- customer A cannot obtain customer B shipment data through `customer_get_order`;
- no advisor regression was introduced by broad grants.

### Step 4: If fixes are required, create a new follow-up migration

Never edit a migration already applied to hosted Supabase.

### Step 5: Commit any follow-up migration/tests only after RED/GREEN evidence

Use a focused commit message describing the grant/constraint fix.

---

## Task 17: Reauthorize Production and validate the complete non-spending path

**Files:**
- Modify only documentation/status if the runtime behaves as designed; code changes require a new TDD fix commit.

**Precondition:** deployed code/migrations are green, but keep:

```text
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false
```

### Step 1: Deploy the exact green candidate to Vercel

Use the canonical runbook. Verify the deployed SHA before restarting from the Vercel dashboard.

### Step 2: Reconnect Melhor Envio in Production

From protected `/admin/integrations/melhor-envio`, reconnect the Production app so the new token grant records the exact Phase 5 scopes. Do not paste credentials/tokens into chat/logs.

### Step 3: Configure fixed sender

Enter PF sender data once. Verify masked CPF display and exact sender CEP = `SHIPPING_ORIGIN_CEP`.

### Step 4: Select one real paid, `ready_to_ship` order for non-spending validation

Verify:

- selected service matches checkout;
- recipient/address correct;
- exactly one package recognized;
- DC-e items/quantities/values match the paid order;
- `Preparar remessa` inserts into Melhor Envio cart but does not buy;
- current label cost is shown against customer-paid shipping;
- purchase button is visibly disabled/unavailable because the capability flag is false;
- no order status prematurely becomes `shipped`.

### Step 5: Stop on any discrepancy

Do not enable spending to work around an error. Fix via TDD, new SHA, redeploy, rerun non-spending validation.

---

## Task 18: Enable the first explicit real label purchase and complete live shipping acceptance

**Files:**
- Environment/config only unless a defect is found.

**Human spending gate:** this task requires the owner to explicitly choose the real order and approve enabling purchase after Task 17 passes. The implementation agent must not flip this flag merely because tests are green.

### Step 1: Enable the fail-closed capability intentionally

Set in private Production environment:

```text
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=true
```

Restart through the Vercel dashboard. Never commit this private production setting.

### Step 2: Verify exact price before spend

On the chosen shipment, confirm UI shows:

```text
Cliente pagou: R$ X
Etiqueta agora: R$ Y
Diferença: R$ Z
Ambiente: Production
```

If the cost changed, the old confirmation must fail and require a fresh confirmation.

### Step 3: Owner clicks `Comprar etiqueta` once

Observe provider-confirmed `purchased` state. If timeout/unknown occurs, **do not click again**; use `Reconciliar compra` and verify the no-double-spend behavior.

### Step 4: Owner clicks `Gerar etiqueta` separately

Verify generation/readiness, then print label and DACE. Confirm the customer order is still not `shipped` merely because documents exist.

### Step 5: Confirm posting/tracking

After real handoff/acceptance, use explicit `Confirmar postagem` or let trusted tracking acceptance transition to `shipped`. Verify the authenticated customer sees the tracking code/status and no private sender/provider data.

### Step 6: Cancellation acceptance is opt-in

Test real cancellation only on a shipment the owner explicitly chooses to cancel and only after reviewing provider refund/cancellation consequences. It is not required to destroy a valid paid label merely to pass acceptance; automated/mock tests remain authoritative for normal cancellation behavior if no suitable live label exists.

---

## Task 19: Reconcile docs and operational status

**Files:**
- Modify: `docs/shipping-setup.md`
- Modify: `docs/superpowers/CURRENT_STATUS.md`
- Modify: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- Modify: `README.md` only if it currently describes label handling as manual-only.
- Modify: `tests/melhor-envio-config-docs.test.ts`
- Create: `tests/phase5-shipping-docs.test.ts`

### Step 1: Write docs contract test RED

Require docs to state:

- PF/CPF + reviewed DC-e/DACE current flow;
- fixed sender setup;
- exact Phase 5 OAuth scopes or canonical shared description;
- explicit purchase then separate generation;
- no automatic purchase;
- purchase capability flag and staged Production enablement;
- hourly tracking cron + existing daily token refresh;
- customer tracking location;
- cancellation confirmation rule;
- one active package/label per order V1;
- no real secrets in docs;
- canonical Vercel deployment instructions remain referenced.

### Step 2: Run RED

```bash
pnpm test -- tests/melhor-envio-config-docs.test.ts tests/phase5-shipping-docs.test.ts
```

### Step 3: Update docs accurately

Remove obsolete statements that the runtime only quotes/manual-labels once Phase 5 is live. Record exact rollout SHA/migration names only after they are known and verified.

For Phase 4 status wording, preserve factual nuance: the owner reported functional smoke as okay, but do not claim the previously omitted authenticated admin cache-header check was performed unless it is actually verified. Keep that specific cache-header verification tracked for final hardening if still outstanding.

### Step 4: Run docs tests GREEN

```bash
pnpm test -- tests/melhor-envio-config-docs.test.ts tests/phase5-shipping-docs.test.ts
```

### Step 5: Commit

```bash
git add docs/shipping-setup.md docs/superpowers/CURRENT_STATUS.md docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md README.md tests/melhor-envio-config-docs.test.ts tests/phase5-shipping-docs.test.ts
```

```bash
git commit -m "docs: record Phase 5 shipping rollout"
```

---

## Task 20: Full verification, exact-SHA CI, and owner handoff

**Files:**
- No code changes unless verification fails; every fix uses RED/GREEN and a new commit.

### Step 1: Run full local verification on the final candidate

```bash
node --version
```

Expected: `v22.1.0`.

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
NODE_ENV=production pnpm build
```

Expected: all PASS.

### Step 2: Verify no accidental spend path exists

Search/import-contract tests must confirm no payment webhook, checkout, ready-to-ship operation, tracking cron, page render, build/deploy script, or health endpoint can invoke `/api/v2/me/shipment/checkout` except the explicit protected purchase service/route.

### Step 3: Push final candidate and wait for exact-SHA CI

Record:

```bash
git rev-parse HEAD
```

Do not call the phase ready until GitHub Actions for that exact SHA is completed successfully with Node.js 22.x, frozen install, typecheck, full tests, Vercel build, private-order route gate, and startup smoke.

### Step 4: Production runtime verification

After deploy/restart, verify the runtime SHA equals the exact green CI SHA. Smoke:

- admin login + TOTP/session;
- Melhor Envio integration shows authorized scope/sender status;
- one prepared shipment and correct cost comparison;
- purchase/generation separation;
- print label/DACE;
- no premature shipped state;
- tracking/customer visibility;
- logout;
- authenticated admin response caching headers (`cache-control`, `expires`, `pragma`, optionally `age/server/x-cache`) so the previously omitted Phase 4 cache-header check is finally closed rather than assumed.

### Step 5: Stop for owner integration choice

Do not merge/squash/rebase/delete the branch. Present the exact final SHA, CI run, applied migration names, production smoke state, and any remaining provider/manual acceptance item. The owner chooses integration separately.

---

## Plan self-review checklist

Before execution starts, verify this plan against the approved spec:

- [x] Dedicated shipment subsystem inside the modular monolith.
- [x] Fixed PF/CPF sender and reviewed DC-e/DACE.
- [x] Trusted order/saved-quote snapshot; no current-catalog rebuild.
- [x] One active package/label per order V1.
- [x] Exact customer-selected service preserved.
- [x] Customer-paid/current-cost/difference shown before purchase.
- [x] Purchase explicit and feature-gated; no automatic spend.
- [x] Generation separate from purchase.
- [x] No label generation/printing -> shipped shortcut.
- [x] Durable purchase claim and no blind retry after unknown outcome.
- [x] Read-only reconciliation/tracking.
- [x] Explicit cancellation confirmation.
- [x] Customer-owned sanitized tracking projection.
- [x] Least-privilege OAuth scope persistence/reauthorization.
- [x] Server-only tokens/CPF-sensitive boundaries.
- [x] Staged direct-Production rollout without Sandbox requirement.
- [x] Migration-first compatibility and no rewriting applied history.
- [x] Exact-SHA CI and Vercel verification before completion claim.
