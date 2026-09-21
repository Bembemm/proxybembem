# Phase 5 — Melhor Envio Shipments, Labels, DC-e/DACE and Tracking Design

Date: 2026-09-08
Status: Approved in chat; awaiting written-spec review
Branch: `feat/admin-dashboard-expansion`

## 1. Goal

Add a production-capable shipment subsystem to the existing ProxyBembem modular monolith so an authenticated admin can turn a paid, ready-to-ship order into one real Melhor Envio shipment, purchase the label only after an explicit confirmation, generate the label in a separate explicit action, print the label and DACE, confirm posting, track delivery, and cancel a label when the provider permits it.

The customer must automatically receive sanitized tracking information in `Minha conta -> Pedidos -> Pedido` once tracking exists.

This phase extends the existing Melhor Envio freight-quote/OAuth integration. It must not create a second provider integration or weaken existing payment, order-ownership, admin-auth, MFA, audit, Supabase, or Vercel boundaries.

## 2. Owner decisions captured by this spec

The following decisions were explicitly approved in chat and are requirements:

1. Continue Phase 5 on the existing `feat/admin-dashboard-expansion` branch; do not merge/rebase Phase 4 first.
2. Use the existing application as a modular monolith with a dedicated shipment subsystem.
3. Current sender mode is one fixed **Pessoa Física / CPF** sender profile.
4. Current document flow supports **DC-e/DACE**. CNPJ/NF-e is a future-compatible mode, not a prerequisite for this rollout.
5. DC-e product lines are assembled automatically from the real order items and shown for review before the shipment is created at Melhor Envio.
6. One order means one active package and one active label at a time in this first version.
7. The provider service defaults to exactly the Melhor Envio service selected and paid by the customer at checkout. A service change must never happen silently.
8. If the current label cost differs from the freight paid by the customer, show `customer paid / current label cost / difference` and let the admin decide. A difference alone neither auto-buys nor blocks the label.
9. `Comprar etiqueta` and `Gerar etiqueta` are separate actions.
10. Generating or printing a label does **not** mark the order as shipped.
11. The order becomes `shipped` only after explicit admin posting confirmation or a trusted provider tracking state indicating actual carrier acceptance/posting.
12. Tracking is visible automatically to the authenticated customer who owns the order.
13. Label cancellation is included in Phase 5 and always requires explicit confirmation.
14. No label purchase is triggered automatically by Mercado Pago approval, production completion, `ready_to_ship`, a cron job, tracking refresh, page load, or retry.
15. The owner does not require Sandbox acceptance before live rollout. This spec therefore replaces the older Phase 5 Sandbox gate with a staged Production rollout in which all non-spending paths are validated first and the first real purchase is an explicit owner-confirmed label.

## 3. Chosen architecture

### 3.1 Dedicated shipment module inside the existing app

The application remains one Next.js/Supabase deployment. Add a bounded shipment module with explicit responsibilities:

- shipment persistence and state machine;
- sender-profile persistence;
- provider request/response parsing;
- cart preparation;
- label purchase;
- label generation;
- label/DACE print-link acquisition;
- tracking reconciliation;
- cancellation;
- customer-safe shipment projection;
- admin-safe operational projection;
- audit/events.

Provider-specific code stays behind a Melhor Envio client boundary. UI/routes must call explicit shipment operations rather than constructing provider payloads themselves.

### 3.2 Rejected: direct provider calls from the order page

A thin implementation that calls Melhor Envio directly from the admin order page is rejected. It cannot reliably prevent double spend, preserve immutable shipping snapshots, reconcile uncertain provider outcomes, or provide a trustworthy audit trail.

### 3.3 Rejected: queues/microservices for all logistics

A separate shipping service, generalized job platform, or broad outbox/queue architecture is rejected for Phase 5. It adds operational complexity that is not justified by the current volume. Read-only tracking refresh may use a small scheduled/internal operation, but spending actions remain synchronous, explicit, and admin initiated.

## 4. Existing foundations that remain authoritative

Phase 5 must preserve these existing boundaries:

- Mercado Pago remains the financial-payment authority for customer orders.
- Customer order ownership comes from trusted authenticated identity, never a client-supplied customer id.
- Existing fulfillment states remain: `awaiting_payment`, `awaiting_production`, `in_production`, `ready_to_ship`, `shipped`, `completed`, `canceled`.
- Existing admin access continues to require the authorized admin UUID, Supabase Auth, AAL2/TOTP, an active admin session, and the existing inactivity/session rules.
- Existing admin write protections, origin checks, rate limits and audit patterns remain in force.
- Product price and shipping metadata remain server-authoritative.
- Existing Melhor Envio OAuth token storage/refresh remains the only token authority. Access/refresh tokens never enter shipment rows or browser payloads.
- Existing Vercel Node/Next.js deployment architecture remains unchanged.

## 5. Provider contract and OAuth permissions

### 5.1 Current provider workflow

The implementation is designed around the current Melhor Envio API sequence:

1. quote shipment;
2. insert shipment in cart: `POST /api/v2/me/cart`;
3. buy cart item: `POST /api/v2/me/shipment/checkout`;
4. generate purchased label: `POST /api/v2/me/shipment/generate`;
5. obtain print link: `POST /api/v2/me/shipment/print`;
6. obtain DACE for DC-e: `GET /api/v2/me/imprimir/dace/{arquivo}/{order_id}`;
7. refresh lifecycle/tracking: `POST /api/v2/me/shipment/tracking` and, where reconciliation needs full provider-order state, `GET /api/v2/me/orders/{id}`;
8. cancel when permitted: `POST /api/v2/me/shipment/cancel`.

The current provider documentation states that a physical-person sender uses `document`/CPF; for declaration-of-content shipments `options.invoice` is omitted, and product data must be complete for the DC-e integration introduced in 2026. The DACE must accompany the package.

### 5.2 Least-privilege OAuth scope set

The current OAuth client asks only for `shipping-calculate`; this is insufficient for Phase 5 and requires a new authorization grant.

The intended Phase 5 permission set is:

- `shipping-calculate`
- `cart-read`
- `cart-write`
- `orders-read`
- `shipping-checkout`
- `shipping-generate`
- `shipping-print`
- `shipping-tracking`
- `shipping-cancel`

Do not request unrelated permissions such as user/company write, product management, coupons, transactions, notification access, sharing, preview, or generic ecommerce permissions unless a concrete endpoint proves they are required. If current provider behavior differs from documentation during implementation, stop and re-evaluate the exact least-privilege set rather than broadening to all scopes.

Changing the scope set requires the admin to reauthorize the connected Melhor Envio account; refreshing an old token must not be treated as permission expansion.

## 6. Sender profile

Add a server-owned sender profile for the single fixed origin selected by the owner.

Required operational fields are the provider-required subset of:

- full name;
- CPF;
- email;
- phone;
- postal code;
- street;
- number;
- complement when present;
- neighborhood;
- city;
- state.

The sender profile is not a general Phase 7 settings system. It is a narrowly scoped logistics record required to create shipments.

Security requirements:

- no public/customer read path;
- no direct browser database access;
- admin UI may show a masked CPF after saving;
- full CPF is used only server-side when constructing the provider request;
- logs and audit payloads must not contain full CPF, full OAuth tokens, or raw provider request bodies;
- updating the sender profile affects only future/reprepared shipments, never an already purchased label.

## 7. Fiscal/document mode

### 7.1 Current mode: CPF + DC-e/DACE

For this rollout, the application supports a `declaration_content` shipment document mode using the fixed CPF sender.

The application must not silently infer a legal classification from the fact that an order exists. Before the cart call, the admin reviews the generated declaration payload and explicitly confirms that the shipment should use the DC-e flow and that the data are correct.

The app then:

- sends the sender as PF/CPF;
- does not send `options.invoice`;
- uses the provider-compatible empty/`ISENTO` state-registration behavior for this mode;
- sends complete `products` data required for DC-e communication;
- stores the returned provider shipment identifier;
- later exposes DACE printing after the provider makes it available.

### 7.2 Declaration items

Declaration items are generated from immutable/trusted order data, not arbitrary browser values:

- description from the order item title;
- quantity from the order item quantity;
- unit value from the order item unit price;
- totals recomputed server-side.

The first version is review-first, not a free-form fiscal editor. Quantity and monetary values cannot be altered in the browser independently of the order. If provider requirements later prove that a dedicated declaration description is necessary, that field may be added as a narrowly validated shipment-only value without changing the paid order.

### 7.3 Future compatibility

The schema must allow a future `invoice` document mode with CNPJ/NF-e fields without redesigning the shipment lifecycle. Phase 5 does not implement business registration, NF-e issuance, or a fiscal ERP integration.

## 8. Shipment persistence model

### 8.1 `shipments`

Create a dedicated `shipments` entity linked to `orders`.

The exact SQL column naming may follow repository conventions, but the model must preserve these concepts:

- local shipment UUID;
- order UUID;
- provider (`melhor_envio`);
- provider environment;
- lifecycle state;
- document mode;
- fixed service id, service name and carrier snapshot;
- freight amount paid by the customer;
- provider cost shown immediately before purchase;
- final provider purchase cost when confirmed;
- currency;
- immutable recipient snapshot;
- sender-profile id/version plus a non-secret sender snapshot sufficient for audit;
- package snapshot;
- declaration-item snapshot;
- provider cart/shipment/order identifiers needed for later operations;
- tracking code when available;
- provider tracking/lifecycle status;
- last tracking synchronization time;
- attention/reconciliation reason code when present;
- optimistic-concurrency/version data;
- created/updated timestamps.

Raw OAuth credentials must never be stored here.

### 8.2 Historical replacements

The database may retain more than one historical shipment row for an order so a canceled label can be replaced without deleting history. The first-version business rule is **at most one active, non-canceled shipment per order**.

This satisfies the owner's `1 order = 1 package = 1 label` operational requirement while still preserving canceled history and future extensibility.

### 8.3 `shipment_events`

Store append-only shipment events for:

- local lifecycle transitions;
- provider tracking changes;
- purchase confirmation;
- generation confirmation;
- posting confirmation;
- cancellation request/result;
- reconciliation/attention results.

Events contain sanitized metadata only. Provider tracking events must have a deterministic fingerprint/idempotency rule so repeated polling cannot duplicate the same public history entry indefinitely.

Existing `admin_audit` remains the authority for who performed sensitive admin actions. Shipment events are operational history, not a replacement for admin security audit.

## 9. Snapshot rules

Preparing a shipment creates an immutable operational snapshot so later product/catalog edits do not silently change a shipment already being processed.

Snapshot sources are trusted server data:

- destination from the order delivery address;
- selected shipping service from the order's server-authoritative checkout snapshot;
- freight paid from `shipping_cents`;
- declaration items from order items/prices;
- package/weight/dimensions from the same trusted shipping/product data path used by checkout, captured for this shipment;
- sender data from the fixed server-owned sender profile.

Before purchase, the admin may discard/reprepare a shipment if source data are wrong. After purchase, sender, recipient, service, package, and declaration snapshots cannot be silently mutated. A necessary correction must follow the provider-supported cancel/recreate path.

## 10. Shipment lifecycle

The first-version local states are:

- `draft` — local shipment exists but review is incomplete;
- `prepared` — trusted snapshot validated and frozen locally;
- `in_cart` — provider accepted the cart insertion;
- `purchase_pending` — checkout call claimed locally and is in progress;
- `purchased` — provider confirmed purchase;
- `generation_pending` — generation call claimed locally and is in progress;
- `generated` — provider confirmed generation/print readiness;
- `posted` — explicit admin posting confirmation or trusted provider posting/acceptance;
- `in_transit` — trusted provider movement after posting;
- `delivered` — trusted provider delivery state;
- `cancel_pending` — cancellation request is in progress or awaiting provider resolution;
- `canceled` — provider/local cancellation is confirmed as applicable;
- `attention_required` — the last operation has an uncertain or contradictory outcome and automated forward progress is blocked until reconciliation.

The event history preserves the last stable state before `attention_required` so reconciliation can safely resume to the provider-confirmed state.

No endpoint or UI may perform arbitrary state assignment. Each operation exposes only a small allowed transition set with preconditions.

## 11. Relationship to order fulfillment

Shipment lifecycle and order fulfillment are deliberately separate.

Rules:

- `draft`, `prepared`, `in_cart`, `purchase_pending`, `purchased`, `generation_pending`, and `generated` do **not** change the order from `ready_to_ship` to `shipped`.
- explicit `Confirmar postagem` may transition an eligible `ready_to_ship` order to `shipped` after the shipment is at least generated/purchased as required by provider flow;
- a trusted provider status equivalent to actual posting/carrier acceptance may perform the same `ready_to_ship -> shipped` transition through a dedicated trusted server operation;
- a trusted provider delivered state may perform `shipped -> completed`;
- shipment cancellation does not cancel the customer order;
- order cancellation does not pretend a provider label was canceled. If a purchased label exists, the admin must resolve that label through the shipment workflow.

Provider-driven fulfillment transitions must be more restrictive than generic admin transitions and must never forge payment state.

## 12. Admin workflow and UI

The shipment controls live in the existing protected admin order detail experience, with integration/sender configuration under the existing Melhor Envio integration section.

### 12.1 Review shipment

When an order is paid and `ready_to_ship`, show:

- recipient;
- selected carrier/service;
- package details;
- customer freight paid;
- auto-generated DC-e items and totals;
- sender summary with masked CPF;
- document mode `DC-e`.

No provider write and no spend occurs simply by opening this screen.

### 12.2 Prepare shipment

`Preparar remessa` freezes the local snapshot and then inserts the shipment in the Melhor Envio cart.

This action does not purchase freight.

If the cart insertion succeeds, persist the provider id and move to `in_cart`. If it definitely fails, remain safely retryable. If provider behavior is ambiguous, use `attention_required` instead of assuming success/failure.

### 12.3 Review cost

Before purchase, obtain/derive the current provider cost from trusted provider/cart data and show:

- `Cliente pagou: R$ X`
- `Etiqueta agora: R$ Y`
- `Diferença: R$ Z`

The sign/label of the difference must make it clear whether the store pays extra or retains a margin. Price mismatch never triggers automatic action.

### 12.4 Buy label

`Comprar etiqueta` is the only Phase 5 action that intentionally spends Melhor Envio wallet balance.

Requirements:

- explicit confirmation showing the exact amount and Production environment;
- admin AAL2/session authorization;
- origin/CSRF-equivalent protection using current project conventions;
- rate limit appropriate for a money-spending operation;
- server-side revalidation of shipment state and provider id;
- atomic/local operation claim preventing double-click/concurrent purchase;
- audit event with admin UUID, shipment/order identifiers, amount, environment and sanitized provider id;
- no automatic retry after an uncertain network/provider outcome.

### 12.5 Generate label

`Gerar etiqueta` appears only after confirmed purchase and is a separate explicit action.

Generation may be asynchronous. The UI may show a pending state and allow safe status refresh; it must not immediately assume a printable label merely because the generation request returned success.

Generation does not mark the customer order as shipped.

### 12.6 Print label and DACE

After generation/readiness:

- expose an admin action to obtain/open the shipping-label print resource;
- expose an admin action to obtain/open the DACE for DC-e shipments;
- prefer provider-private or short-lived server-mediated access over unnecessarily creating a public permanent print URL;
- never expose the print URL in the customer order API/page.

Printing does not change fulfillment status.

### 12.7 Confirm posting

Provide an explicit `Confirmar postagem` action. It records an audit/event and transitions the eligible order to `shipped`.

If trusted provider tracking reports posting first, the system may transition automatically and the manual action becomes unnecessary/idempotent.

### 12.8 Cancel label

Provide `Cancelar etiqueta` only when local/provider state indicates cancellation may be attempted.

Before the request, show a strong confirmation including the current shipment state and a warning that generated/posted labels may be subject to provider cancellation/refund rules.

Cancellation is never automatic. A provider rejection or uncertain outcome does not delete the shipment or locally fake a refund.

## 13. Idempotency, concurrency and uncertain money outcomes

This is the primary correctness requirement of Phase 5.

### 13.1 Operation claims

Each side-effecting operation must claim the shipment transition atomically in Supabase before making a provider call. Concurrent requests must observe that another operation is active and return a harmless conflict/already-in-progress result.

At minimum this applies to:

- cart insertion;
- checkout/purchase;
- generation;
- cancellation;
- manual posting transition.

The repository should follow existing RPC/lease/version patterns rather than relying on in-memory locks, because Vercel process restarts and parallel requests invalidate in-memory assumptions.

### 13.2 Purchase timeout rule

If the checkout request times out or loses connection after the request may have reached Melhor Envio:

1. do not retry checkout automatically;
2. move to `attention_required` with a sanitized `purchase_outcome_unknown` reason;
3. block a second purchase;
4. reconcile using provider order/cart data with `orders-read`/cart read capabilities;
5. if provider confirms purchase, transition to `purchased` and record the confirmed cost;
6. if provider conclusively confirms no purchase, return to a safe retryable pre-purchase state;
7. if still ambiguous, remain blocked for admin review.

The same conservative principle applies to cancellation uncertainty, though the financial risk differs.

## 14. Tracking

Tracking is read-only and may be refreshed automatically because it cannot spend balance.

A small internal scheduled operation may poll active shipments at a reasonable cadence. Manual refresh from the admin is also acceptable. Do not introduce a generalized background-job platform in this phase.

Tracking parser requirements:

- validate provider response structure before persistence;
- map only known provider lifecycle states;
- unknown states are stored/surfaced for admin attention without inventing a fulfillment transition;
- deduplicate repeated tracking events;
- never move fulfillment backwards because of a stale provider response;
- `posted`/equivalent may move `ready_to_ship -> shipped`;
- `delivered` may move `shipped -> completed`;
- read-only refresh must never purchase, generate, cancel, or alter payment state.

## 15. Customer experience

Extend the existing authenticated `Minha conta -> Pedidos -> Pedido` page rather than building a new public tracking endpoint.

The customer's shipment projection may expose only what is needed for their delivery:

- carrier/service;
- tracking code when available;
- sanitized delivery status;
- public tracking timeline events;
- relevant timestamps.

Do not expose:

- actual label purchase cost;
- difference between customer freight and provider cost;
- sender CPF;
- OAuth tokens;
- provider cart/internal ids;
- admin UUIDs/audit details;
- raw provider payloads;
- label or DACE admin print links.

Customer access continues to be based solely on authenticated ownership of the order.

## 16. Security and data-access boundaries

### 16.1 Database

New shipment/sender tables are backend-operated. Browser clients do not receive generic direct write access.

Migrations must use least-privilege grants consistent with the existing server-side architecture. If RLS is enabled without direct user policies, all access occurs through trusted server code/RPCs as designed.

### 16.2 APIs

Every admin shipment mutation requires existing admin authorization including AAL2 and active app session. Mutation routes also enforce the project's existing same-origin and rate-limit conventions.

Customer shipment reads use the existing customer-auth/order-ownership boundary.

### 16.3 Logging

Never log:

- full CPF;
- OAuth access/refresh tokens;
- authorization headers;
- raw request bodies containing sender/recipient PII;
- label/DACE URLs if they carry access-bearing query data.

Operational logs should use action name, local shipment/order ids, HTTP status/classification, provider environment and sanitized provider ids only where safe.

## 17. Production rollout without Sandbox gate

This section intentionally supersedes the older master-plan requirement that Sandbox acceptance must precede real balance capability.

The owner explicitly chose a direct Production rollout, so the safety gate becomes:

1. automated tests use mocked/fake provider responses and never hit a spending endpoint;
2. deploy OAuth/sender/shipment read and non-spending preparation capabilities first;
3. reauthorize Melhor Envio with the exact approved least-privilege Production scopes;
4. validate connection, sender configuration, order snapshot, DC-e review and provider cart preparation without buying a label;
5. verify the UI clearly shows the Production environment and exact current label cost;
6. only then, on a real shipment selected by the owner, the owner explicitly clicks and confirms `Comprar etiqueta`;
7. verify provider purchase state before generating;
8. explicitly generate, print label/DACE, post and verify tracking;
9. keep automatic purchase permanently prohibited.

No CI test, page load, deployment hook, cron or health check may invoke `/shipment/checkout`.

## 18. Testing and acceptance

### 18.1 Unit/module tests

Cover at least:

- sender validation and CPF masking/no-leak behavior;
- trusted DC-e item construction from order items;
- snapshot immutability;
- service id preservation from checkout;
- customer-paid/current-cost/difference calculations;
- provider request serialization and strict response parsing;
- OAuth scope contract;
- state-machine allowed/forbidden transitions;
- `generated` not changing order fulfillment;
- tracking `posted` mapping to `shipped` only from an eligible state;
- tracking `delivered` mapping to `completed` only from an eligible state;
- unknown/stale tracking not regressing fulfillment;
- cancellation guards;
- customer-safe projection excluding sensitive/admin fields.

### 18.2 Concurrency/idempotency tests

Prove:

- double-click cannot purchase twice;
- two concurrent purchase requests produce one provider checkout claim;
- a purchase timeout does not cause an automatic retry;
- `attention_required` blocks a second spend until reconciliation;
- reconciliation can resolve confirmed-purchased and confirmed-not-purchased cases safely;
- duplicate tracking polls/events do not duplicate customer history;
- concurrent cancel/generate/purchase attempts obey the state machine.

### 18.3 Auth/security tests

Prove:

- unauthenticated/non-admin users cannot mutate shipments;
- admin without AAL2/active session cannot spend or cancel;
- cross-origin mutation attempts are rejected according to project conventions;
- customer A cannot read customer B shipment/tracking;
- OAuth tokens/full CPF/raw provider payloads are absent from browser responses and logs under tested error paths.

### 18.4 Repository verification

Before any deploy candidate is called ready:

- typecheck passes;
- Vercel production build passes;
- full automated test suite passes;
- migration/grant tests pass;
- exact candidate SHA has green CI evidence.

### 18.5 Live Production acceptance

Live acceptance uses one intentional owner-selected shipment and verifies, in order:

- reauthorized OAuth connection;
- fixed sender profile;
- correct order/service/DC-e review;
- cart preparation with no spend;
- exact current cost display;
- one explicit label purchase;
- provider-confirmed purchased state;
- separate explicit generation;
- label and DACE printing;
- no premature `shipped` state;
- posting/manual or provider tracking transition to `shipped`;
- tracking visible to the correct customer only;
- eventual delivered -> completed mapping where practical;
- cancellation behavior on a suitable test/real case only if the owner explicitly chooses to incur that live operation.

## 19. Out of scope

Phase 5 does not include:

- automatic label purchase after payment;
- multiple simultaneous packages/labels for one order;
- a generalized warehouse/packing system;
- automatic carrier/service substitution;
- NF-e issuance;
- CNPJ/MEI setup;
- accounting/tax advice or fiscal ERP integration;
- transactional shipping email/WhatsApp notifications (Phase 6);
- generic editable store settings (Phase 7);
- dashboard analytics/attention-center expansion beyond shipment-specific attention (Phase 8);
- unrelated storefront redesign;
- generalized queue/microservice infrastructure.

## 20. Implementation handoff constraints

The implementation plan must preserve these non-negotiable invariants:

- no automatic spend;
- explicit purchase and generation remain separate;
- provider-selected service cannot silently differ from the customer's selected service;
- one active package/label per order in v1;
- no `shipped` transition merely because a label exists;
- no blind checkout retry after an uncertain outcome;
- customer tracking is ownership-scoped and sanitized;
- provider credentials remain server-only;
- CPF/DC-e is the current rollout mode, with future NF-e compatibility but no fiscal subsystem in Phase 5;
- direct Production rollout is staged so non-spending behavior is verified before the first owner-confirmed real label purchase.

## 21. Provider references checked for this design

Current Melhor Envio documentation rechecked on 2026-09-08:

- OAuth permissions: `https://docs.melhorenvio.com.br/reference/fluxo-de-autoriza%C3%A7%C3%A3o`
- Insert shipment in cart / PF and DC-e rules: `https://docs.melhorenvio.com.br/reference/inserir-fretes-no-carrinho`
- Purchase/checkout: `https://docs.melhorenvio.com.br/reference/compra-de-fretes-1`
- Generate label: `https://docs.melhorenvio.com.br/reference/geracao-de-etiquetas`
- Print label: `https://docs.melhorenvio.com.br/reference/impressao-de-etiquetas`
- DACE printing: `https://docs.melhorenvio.com.br/reference/impressao-dace`
- Tracking: `https://docs.melhorenvio.com.br/reference/rastreio-de-envios`
- Provider-order details: `https://docs.melhorenvio.com.br/reference/listar-informacoes-de-uma-etiqueta`
- Cancel label: `https://docs.melhorenvio.com.br/reference/cancelamento-de-etiquetas`

Provider contracts must be rechecked again immediately before each endpoint is implemented because external API behavior may change.
