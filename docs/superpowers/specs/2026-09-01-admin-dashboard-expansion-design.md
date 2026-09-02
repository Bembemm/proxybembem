# Admin Dashboard + Customer Account Expansion Design

Date: 2026-09-01
Status: Approved in chat; awaiting written-spec review
Branch: `feat/admin-dashboard-expansion`
Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`

## 1. Goal

Expand the existing protected ProxyBembem administrative area into a full operational store dashboard while preserving the already Production-accepted checkout, Mercado Pago payment, Melhor Envio freight, Supabase, and admin-auth security boundaries.

This expansion also introduces a lightweight customer account area so customers can sign in, see their own orders, track production and shipping, and contact ProxyBembem about a specific order without forcing account creation before checkout.

The guiding architecture is a **modular monolith** using the existing Next.js + Supabase application. Orders, customers, catalog, shipping, notifications, settings, audit, and integrations remain in one application but are separated into clear modules, tables, APIs, authorization boundaries, and tests.

## 2. Existing Production foundations that must remain intact

The implementation must treat the following as accepted foundations, not as areas to casually redesign:

- Mercado Pago Checkout Pro preference creation and signed webhook processing.
- Server-authoritative payment amount validation.
- Atomic Mercado Pago payment application through the existing database RPC.
- Existing `orders` records and customer-facing public order token flow.
- Melhor Envio freight quoting and existing OAuth token infrastructure.
- Admin login with Supabase Auth, password, mandatory TOTP MFA, `aal2`, single active administrative session, and 30-minute inactivity timeout.
- Existing storefront visual identity and current `/admin` visual model.
- Server-authoritative catalog pricing behavior: the browser never decides price or shipping metadata.

No expansion phase may weaken these guarantees.

## 3. Architectural choice

### 3.1 Chosen approach: modular monolith

The application remains a single Next.js project with bounded modules:

- Orders / fulfillment
- Payments
- Customers / customer auth
- Catalog
- Shipments / Melhor Envio
- Notifications
- Store settings
- Admin audit
- Integrations
- Dashboard analytics

Each module must expose explicit functions and APIs rather than sharing generic unrestricted database mutation helpers.

### 3.2 Rejected approaches

**Single giant dashboard directly mutating `orders`:** rejected because payment, production, catalog, shipment, customer, and notification concerns would become tightly coupled and difficult to secure.

**Multiple independent services/microservices:** rejected because it adds unnecessary operational complexity for the current store scale.

## 4. Security principles

### 4.1 Admin URL is not a secret

The administrative namespace remains `/admin`.

Security must not depend on hiding or randomizing the URL. Every protected admin page and every administrative API must independently require trusted server-side authorization.

Administrative authorization continues to require:

- authorized immutable admin UUID;
- valid Supabase session;
- `aal2` after TOTP;
- valid active `admin_sessions` row;
- inactivity/session rules already defined by the existing admin-auth design;
- fail-closed behavior when authorization cannot be verified.

### 4.2 No generic admin write endpoint

The admin panel must not receive a generic object and PATCH arbitrary order/product/payment fields.

Use explicit operations such as:

- `startProduction(orderId)`
- `markReadyToShip(orderId)`
- `markShipped(orderId, shipmentId)`
- `cancelOrder(orderId, reason)`
- `updateProduct(productId, validatedPatch)`
- `prepareShipment(orderId)`
- `purchaseShipmentLabel(shipmentId)`

Each operation must validate its own preconditions and write audit/history events.

### 4.3 Financial state remains provider-authoritative

Admin users must **not** be able to manually set a payment to `approved`, `refunded`, `charged_back`, or another provider financial state by directly changing a database field.

Payment state remains authoritative from Mercado Pago and the existing trusted server-side flow.

The dashboard may:

- display financial status and details;
- display provider IDs and expected totals where appropriate for admin use;
- highlight `manual_review` cases;
- later initiate a real provider operation such as refund when explicitly implemented and confirmed.

A provider-side financial action is complete only after provider confirmation. The admin UI must never simulate completion by changing a local column first.

### 4.4 Sensitive infrastructure data stays out of the panel

The panel may never expose or edit secrets such as:

- Supabase secret/service credentials;
- Mercado Pago access tokens/secrets;
- Melhor Envio client secrets/access tokens/refresh tokens;
- TOTP secrets;
- password hashes;
- `ADMIN_USER_ID`;
- encryption keys;
- webhook secrets.

These remain server environment/runtime configuration.

## 5. Order model and operational fulfillment

### 5.1 Preserve existing order snapshots

`orders.items` remains an immutable purchase snapshot containing the trusted product title, unit price, quantity, and shipping metadata used at checkout time.

Changing a product price or description later must never alter historical orders.

### 5.2 Separate financial state from physical fulfillment

Payment status and fulfillment status are independent dimensions.

Financial status remains under Mercado Pago/provider control.

Operational fulfillment uses stable internal values:

- `awaiting_payment` — Aguardando pagamento
- `awaiting_production` — Aguardando produção
- `in_production` — Em produção
- `ready_to_ship` — Pronto para envio
- `shipped` — Enviado
- `completed` — Concluído
- `canceled` — Cancelado

The UI displays Portuguese labels while the database/application uses stable internal values.

### 5.3 Automatic transition after approved payment

The only normal automatic financial-to-operational transition is:

`awaiting_payment` + trusted Mercado Pago `approved` -> `awaiting_production`.

This transition must be concurrency-safe and idempotent. Duplicate/replayed webhook events must not duplicate order events or advance fulfillment more than once.

If a later refund or chargeback occurs, the physical fulfillment state is **not** automatically rewound. The order remains in its real physical stage and receives a visible attention condition.

### 5.4 Fulfillment transition rules

Normal forward transitions:

`awaiting_payment` -> `awaiting_production` -> `in_production` -> `ready_to_ship` -> `shipped` -> `completed`

`canceled` is a terminal administrative state where cancellation is still valid.

Impossible transitions must be rejected server-side, not merely hidden in the UI. Examples:

- `awaiting_payment` directly to `shipped` — reject.
- `completed` directly back to `in_production` — reject unless a future explicit exceptional recovery operation is designed and audited.
- production start without trusted approved payment — reject.

### 5.5 Attention flags are separate from fulfillment

Do not overload the fulfillment state with generic “problem” values.

An order may remain `in_production` while also showing an attention state such as:

- payment refunded;
- chargeback;
- address issue;
- shipment provider failure;
- notification failure requiring manual contact;
- manual financial review.

This preserves the true physical state while surfacing problems.

## 6. Order history and administrative audit

### 6.1 `order_events`

Introduce an append-oriented order event timeline for meaningful lifecycle events, including examples such as:

- order created;
- payment approved;
- payment refunded/charged back;
- production started;
- ready to ship;
- shipment prepared;
- label purchased;
- label generated;
- order shipped;
- tracking update;
- order completed;
- order canceled;
- attention flag added/resolved.

Events should record structured metadata without exposing secrets.

### 6.2 `admin_audit_log`

Introduce a separate append-only administrative audit log.

Administrative actions record at least:

- entity type;
- entity ID;
- action type;
- admin user UUID;
- timestamp;
- previous state or relevant previous values;
- new state or relevant new values;
- structured non-secret metadata.

Examples:

- fulfillment `awaiting_production` -> `in_production`;
- product price `11990` -> `12990` cents;
- customer delivery address corrected before label purchase;
- product deactivated;
- shipment label cancellation requested.

The normal admin UI must not offer edit/delete operations for audit history.

## 7. Customer and delivery data

### 7.1 Admin visibility

The administrator may view the customer details required to operate the order, including:

- customer name;
- email when present;
- WhatsApp/contact number;
- delivery address;
- purchase history visible through the customer/order relationship.

### 7.2 Address editing rule

Before a shipment label is purchased, the admin may correct delivery information through an explicit audited operation.

After a label has been purchased, the admin must not silently change the order address while leaving an incompatible label active.

A post-label address change must require the appropriate shipment cancellation/recreation workflow or another explicit safe provider-supported flow.

This prevents the database order and purchased carrier label from disagreeing.

## 8. Customer accounts

### 8.1 Account model

Introduce a lightweight optional customer account system using Supabase Auth.

Customer authentication uses:

- email;
- permanent password;
- email verification;
- password reset by email.

The customer is identified internally by an immutable authentication user UUID / `customer_id`, not by mutable name or raw email text.

### 8.2 Email uniqueness

Email is the unique account identity and must be normalized/case-insensitive according to the chosen auth/storage implementation.

Two names may be identical. Names are never unique identifiers.

Do not create an additional public username system in this scope.

### 8.3 Permanent customer profile data

Keep the permanent profile intentionally small:

- customer/user UUID;
- name;
- verified email / normalized email representation as needed;
- WhatsApp/contact number;
- created/updated timestamps;
- optional minimal preferences only when required.

Do not permanently store payment-card data.

Delivery address and transaction-specific sensitive data belong primarily to the order/shipment context, not the permanent account profile.

If CPF or another document is required by a payment/shipping provider, store it only where operationally necessary for that purchase/shipment and apply strict access/minimization rules.

### 8.4 Guest checkout remains supported

Account creation must **not** become mandatory for purchase.

Two supported flows:

**Authenticated customer:** checkout creates the order linked to the trusted `customer_id`.

**Guest:** checkout continues to function without account creation and the existing secure public order-status token remains valid.

After purchase, the customer may be invited to create an account for centralized order tracking.

### 8.5 Safe order claiming/linking

Never attach an old/guest order to an account based only on a matching name.

Any claim/link flow must prove ownership using trusted evidence, for example verified email plus a secure order token/claim flow.

The exact claiming mechanism will be defined in the implementation plan and tested against account takeover scenarios.

### 8.6 Customer authorization

Customer accounts and admin authorization are separate security boundaries.

A normal customer can never gain administrative access merely by authenticating through Supabase.

All customer order APIs must enforce that the requested order belongs to the current trusted `customer_id`, except the existing public-token status flow which remains separately token-authorized.

## 9. Customer-facing account UI

Use the existing storefront visual identity, not the admin styling.

Planned routes:

- `/entrar`
- `/criar-conta`
- `/esqueci-a-senha`
- `/minha-conta`
- `/minha-conta/pedidos`
- `/minha-conta/pedidos/[id]`
- `/minha-conta/perfil`
- `/minha-conta/seguranca`

The account area should show:

- current/last orders;
- payment status in customer-safe language;
- production status;
- shipping/tracking status;
- order timeline appropriate for the customer;
- a “Falar sobre este pedido” WhatsApp action that includes the order number in the prefilled message.

Customer DTOs/view models must intentionally exclude internal fields such as provider tokens, raw shipping snapshots, internal fingerprints, admin audit data, secret IDs, and other server-only details.

## 10. Catalog migration and product management

### 10.1 Move trusted catalog to Supabase

The current trusted catalog lives in `data/products.ts`. The target is a persistent `products` source managed through the admin panel and read server-side by checkout.

The database catalog should support at least:

- stable product ID;
- title;
- image/reference;
- original price in integer cents;
- current sale price in integer cents;
- active/inactive status;
- featured flag;
- tag/category;
- descriptions/highlights/details/sections or an equivalent validated structured content model;
- production lead-time copy/configuration where product-specific;
- shipping weight and dimensions;
- created/updated timestamps.

### 10.2 Server-authoritative checkout remains mandatory

The browser still submits only identifiers/quantities and allowed customer data.

The server reads trusted product data from the database, validates price and shipping metadata, computes totals, and writes the immutable snapshot into the order.

Client-provided prices or dimensions are never trusted.

### 10.3 Safe migration strategy

Do not delete the current static catalog immediately.

Use staged migration:

1. create database catalog schema;
2. seed/migrate the two current products with equivalent values;
3. build trusted server-side database reader;
4. test equivalence against current catalog behavior;
5. deploy admin product management in a way that does not yet risk current checkout if needed;
6. switch checkout source only after Preview validation;
7. retain a defined rollback path during rollout;
8. remove obsolete static authority only after the new source is proven.

### 10.4 Admin product writes

Product edits use a form with explicit **Salvar alterações** behavior, not per-keystroke live publishing.

Server validation must reject invalid values, including non-positive prices and shipping dimensions.

Product ID is stable and not casually mutable.

High-impact actions such as deactivating a product or changing a price require clear confirmation and audit logging.

## 11. Shipping, labels, and tracking

### 11.1 Current OAuth scope is insufficient for labels

The current Melhor Envio integration requests only freight calculation permission. Label-management work must explicitly expand provider permissions using least privilege.

The exact final provider scopes must be verified against current Melhor Envio documentation during implementation. The design intent is to request only capabilities required for:

- freight calculation;
- cart/order preparation;
- shipment checkout/purchase;
- label generation;
- label printing;
- tracking;
- order read;
- label/shipment cancellation when implemented.

Do not request unrelated account, user, company, product, or coupon permissions merely for convenience.

### 11.2 Label purchase is always explicit

A successful payment must **not** automatically spend Melhor Envio balance.

The safe operator flow is:

1. payment approved;
2. production progresses;
3. order reaches `ready_to_ship`;
4. admin opens order;
5. admin reviews customer/address/freight;
6. admin explicitly prepares shipment;
7. system shows final shipment/provider data and cost;
8. admin explicitly confirms label purchase;
9. system purchases/generates label;
10. admin prints/downloads as supported;
11. tracking is attached to shipment/order.

### 11.3 Risk levels

Read-only operations may update automatically when safe, especially tracking/status synchronization.

Actions that spend money or cancel purchased resources require explicit admin confirmation.

Examples:

- tracking refresh — automatic/read-only allowed;
- integration health/status — read-only allowed;
- prepare shipment — explicit admin action;
- purchase label — explicit admin action;
- generate label — explicit admin action or safe post-purchase step;
- cancel label — explicit strong confirmation.

### 11.4 `shipments`

Use a dedicated shipment entity rather than overloading `orders` with every provider lifecycle field.

A shipment record should represent at least:

- order relationship;
- provider;
- service/carrier;
- provider shipment/cart/order IDs as needed;
- final purchased amount when applicable;
- label lifecycle state;
- tracking code/state;
- purchased/generated/printed/canceled timestamps when applicable;
- structured non-secret provider metadata needed for operation;
- created/updated timestamps.

No provider access token belongs in a shipment row or client-visible response.

## 12. Notifications

### 12.1 Transactional email scope

Plan transactional email notifications for:

- account email verification;
- password reset;
- order created;
- payment approved;
- production started;
- ready to ship where useful;
- shipped with tracking;
- cancellation/refund where applicable.

Marketing/newsletter functionality is out of scope for this expansion.

Automated WhatsApp messaging is also out of scope initially. WhatsApp remains a direct customer-to-store contact action.

### 12.2 Notification queue/job model

Provider email delivery must not be part of the critical payment/order transaction.

For example, Mercado Pago webhook handling must first safely store/apply the payment result. A notification job may then be queued separately.

Email provider downtime must never cause a legitimate payment webhook to fail or roll back an order state.

Introduce a notification job/outbox model that supports:

- event/template type;
- related customer/order;
- destination;
- status (`pending`, `sent`, `failed`, etc.);
- attempt count;
- next retry or retry metadata;
- last error summary safe for admin visibility;
- created/sent timestamps.

Failures may create an operational attention indicator without corrupting order/payment state.

The admin order timeline/detail may show transaction notification history.

## 13. Store settings

Introduce database-backed store settings only for safe commercial/operational configuration.

Examples may include:

- default production lead time;
- customer-facing operational copy;
- public contact information;
- selected storefront behavior explicitly approved for settings;
- other non-secret store options currently requiring code changes.

Do **not** build an infrastructure-secret editor.

High-impact settings should require explicit confirmation and audit logging.

Settings should use typed/validated access rather than arbitrary unvalidated JSON throughout the application.

## 14. Admin dashboard and routes

Reuse the current admin visual model: light background, cards, subtle borders, violet accent, simple icons, responsive/mobile-friendly behavior.

Do not perform an unrelated visual redesign.

Planned routes:

- `/admin` — operational overview/dashboard
- `/admin/pedidos` — order list, search, filters
- `/admin/pedidos/[id]` — complete order operation view
- `/admin/producao` — production queue
- `/admin/clientes` — customer list
- `/admin/clientes/[id]` — customer/order history view
- `/admin/produtos` — catalog list
- `/admin/produtos/[id]` — safe product editor
- `/admin/envios` — shipment/label/tracking operations
- `/admin/integrations/...` — Mercado Pago and Melhor Envio integration management/status
- `/admin/configuracoes` — permitted store settings
- `/admin/auditoria` — append-only administrative history view

### 14.1 Order detail page is the operational center

The order detail page should bring together:

- order number/date;
- financial state;
- fulfillment state;
- attention flags;
- customer/contact;
- purchased items/snapshot;
- totals/freight;
- delivery address;
- payment/provider details safe for admin use;
- production actions;
- shipment/label/tracking;
- notification status;
- order event timeline;
- relevant audit history.

Do not require the admin to jump across many pages to resolve one order.

### 14.2 Production page

The production page is optimized for operational throughput and may organize orders by:

- awaiting production;
- in production;
- ready to ship.

Quick safe transitions may be available, but destructive/financial/shipping-purchase actions remain on the detailed order flow with appropriate confirmation.

## 15. Dashboard metrics

Start with useful operational/financial metrics derived from trustworthy persisted data, not vanity analytics.

Initial dashboard may include:

- orders today/week/month;
- approved payment value today/week/month;
- awaiting production count;
- in production count;
- ready to ship count;
- shipped count;
- orders requiring attention;
- refunds/chargebacks/manual-review count;
- product quantities sold.

Trend graphs may be added only when the underlying definitions are stable and useful.

Do not add tracking/advertising analytics as part of this scope.

## 16. Data model direction

The exact SQL migration plan will be written after this spec is approved, but the intended model is:

### Existing tables retained

- `orders`
- `admin_sessions`
- Melhor Envio OAuth/token/state infrastructure
- rate-limit/payment-related existing structures

### `orders` additions

Conceptually add:

- nullable `customer_id` relationship for authenticated customers;
- `fulfillment_status`;
- attention indicator/state as a structured model;
- operational timestamps only where useful for direct querying.

Do not duplicate every event timestamp if `order_events` is the better source.

### New tables/modules

- `customer_profiles`
- `products`
- `shipments`
- `order_events`
- `admin_audit_log`
- `notification_jobs` / equivalent outbox
- `store_settings`

Every table must receive appropriate constraints, indexes, RLS/access restrictions, and server-only mutation paths.

## 17. Existing-order backfill/migration policy

Migrations must not fabricate facts about historical orders.

When adding fulfillment status to existing orders:

- trusted `approved` payment with no known fulfillment state -> initialize to `awaiting_production`;
- non-approved payment -> initialize to `awaiting_payment`;
- never guess that a historical order was produced, shipped, or completed;
- ambiguous cases may be marked for administrative review.

Do not invent retroactive `order_events` pretending events occurred at known times when the system never recorded them.

## 18. Compatibility-first migrations

Database migrations must be safe for rolling application deployments.

Avoid schema changes that require new application code to exist at the exact instant the migration is applied.

Preferred pattern:

1. additive nullable/default-compatible schema;
2. backfill safely;
3. application begins reading/writing new fields;
4. verify Production behavior;
5. tighten constraints in a later migration only when safe.

This rule is especially important for:

- `fulfillment_status`;
- `customer_id`;
- product catalog migration;
- shipment lifecycle fields;
- notification jobs.

## 19. Notifications and external integrations must fail independently

Critical order/payment persistence is more important than secondary integrations.

Examples:

- email provider failure must not fail payment approval;
- tracking API failure must not change financial state;
- dashboard metric failure must not block checkout;
- label API failure must not erase `ready_to_ship` or purchase data already confirmed;
- integration-status polling must not keep the admin inactivity session alive.

## 20. Confirmation policy for risky admin actions

Normal reversible operational transitions may use direct clear actions.

High-risk actions must show explicit confirmation with the target and consequence, including:

- cancel order;
- request/perform provider refund when implemented;
- purchase shipping label;
- cancel purchased label;
- deactivate product;
- significant price change;
- high-impact store setting change.

The implementation should be mobile-safe so accidental taps do not immediately execute destructive or money-spending operations.

## 21. Testing strategy

### 21.1 Test-driven development

Each implementation block begins with focused failing tests before production code.

### 21.2 Orders / fulfillment tests

Cover at least:

- cannot start production without trusted approved payment;
- approved payment advances only `awaiting_payment` -> `awaiting_production`;
- duplicate webhook/payment events do not duplicate fulfillment events;
- impossible fulfillment transitions are rejected;
- refund/chargeback does not falsify physical fulfillment state;
- attention flags appear for relevant provider reversals;
- admin-only mutations reject customers/unauthenticated requests;
- audit entries are created with expected non-secret metadata.

### 21.3 Customer auth/security tests

Cover at least:

- duplicate email account cannot be created;
- unverified email behavior matches the approved auth requirement;
- password reset flow works;
- customer A cannot access customer B orders;
- customer cannot access `/admin` or admin APIs;
- guest public-token order flow still works;
- order claim/link flow cannot rely on name alone;
- customer DTO does not expose internal fields.

### 21.4 Catalog tests

Cover at least:

- checkout trusts database product price, not browser price;
- inactive/unknown product cannot be purchased;
- invalid price/dimensions rejected on admin write;
- historical order snapshot does not change after catalog edits;
- initial migrated products match current known prices/shipping metadata.

### 21.5 Shipment tests

Cover at least:

- payment approval does not automatically buy label;
- label purchase requires valid admin session and explicit operation;
- order/address validation occurs before purchase;
- address change after label purchase is blocked from silent divergence;
- idempotency prevents accidental double label purchase where provider/API design allows;
- cancellation requires explicit confirmation path;
- tracking refresh is read-only with respect to financial state;
- provider failures preserve valid local state and surface retry/attention.

### 21.6 Notification tests

Cover at least:

- payment success persists even when email delivery fails;
- duplicate domain events do not create uncontrolled duplicate customer emails;
- failed jobs can retry safely;
- customer/admin views receive only safe error summaries.

### 21.7 Standard repository verification gates

For every meaningful implementation checkpoint:

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

A passing subset must not be presented as full verification.

## 22. Preview and rollout strategy

### 22.1 Preview-first

Each major phase is implemented and validated on its feature branch/Preview before Production approval.

Preview acceptance includes manual checks of relevant flows, not only page rendering.

### 22.2 Sandbox-first for provider-changing functionality

New Mercado Pago or Melhor Envio provider-changing actions should be exercised in the appropriate Sandbox/test context before real Production action where the provider supports it.

Label purchasing deserves its own acceptance checklist because it spends provider balance.

### 22.3 Gradual enablement

Features should be deployable without forcing all new subsystems to become authoritative at once.

Examples:

- customer accounts may become available while guest checkout continues;
- admin product editor may exist before checkout switches away from static catalog authority;
- new database structures may exist before they are required by all code paths.

### 22.4 Rollback requirements

Every major phase must define a safe rollback path.

Examples:

**Catalog:** restore static catalog reader temporarily without altering already-created order snapshots.

**Customer account:** disable new account UI while preserving guest checkout and public-token order tracking.

**Labels:** disable admin label actions while preserving current freight calculation.

A new optional subsystem must not take the stable checkout down with it.

## 23. Production approval state model

Implementation status must be tracked with distinct concepts:

- `IMPLEMENTED`
- `TESTED`
- `PREVIEW APPROVED`
- `PRODUCTION APPROVED`

A feature being implemented or passing automated tests does **not** authorize merge or Production rollout.

Risky Production changes and merges continue to require explicit owner approval.

## 24. Planned implementation order

The expected dependency order is:

1. data/audit foundation;
2. admin orders + fulfillment;
3. customer account and customer-owned order views;
4. database-backed catalog and admin product management;
5. full Melhor Envio shipment/label/tracking workflow;
6. transactional notification outbox and email delivery;
7. store settings;
8. dashboard/operational metrics;
9. security hardening, cross-module integration testing, Preview acceptance, and Production rollout.

The implementation plan may break these phases into smaller checkpoints, but should not ignore their dependency order without documenting why.

## 25. Master-plan continuation requirements

After this written design is reviewed and approved, create a separate executable master plan/checkpoint document, expected path:

`docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`

It must be the operational source of truth for this expansion and contain explicit checkboxes/status for phases and tasks.

Each meaningful checkpoint must record:

- current phase;
- current task;
- task status;
- last verified commit;
- RED/GREEN evidence where applicable;
- `pnpm test` result;
- `pnpm typecheck` result;
- `pnpm build` result;
- Preview deployment/result when applicable;
- whether owner manually approved Preview;
- whether Production is approved;
- blockers;
- exact next action;
- decisions future sessions must not rediscover.

Recommended status semantics:

- `[ ]` not started
- `[~]` in progress
- `[x]` completed and evidence recorded

A checkbox must not be marked complete without the evidence required by that task.

### Required continuation block

Each active phase should end with a block equivalent to:

```md
### SESSION CHECKPOINT

Status: IN PROGRESS
Current phase: <phase>
Current task: <task>

Last verified commit:
<sha or none>

Verification:
- focused tests: <PASS/FAIL/not run>
- pnpm test: <PASS/FAIL/not run>
- pnpm typecheck: <PASS/FAIL/not run>
- pnpm build: <PASS/FAIL/not run>

Preview:
<deployment/url/state or not created>

Production:
NOT APPROVED | APPROVED | DEPLOYED + evidence

Blockers:
<none or exact blocker>

NEXT EXACT ACTION:
<one concrete action>

DO NOT REDISCOVER:
- <key architectural decision>
```

The repository-wide `docs/superpowers/CURRENT_STATUS.md` remains the concise project-wide checkpoint and should point to the master plan while this expansion is active.

## 26. Out of scope for the initial expansion

- Multiple admin users or role hierarchy.
- Public admin signup.
- Replacing TOTP admin MFA with weaker authentication.
- Hiding `/admin` behind a secret/random URL as a primary security mechanism.
- Marketing newsletters/campaign automation.
- Automated WhatsApp messaging provider integration.
- Storing customer payment cards.
- Building a full CRM with arbitrary customer notes/workflows unrelated to orders.
- Microservice decomposition.
- Hosting migration.
- Unrelated storefront redesign.
- Unrelated refactors that do not support this expansion.

## 27. Decisions future sessions must not rediscover

1. Use a modular monolith, not a giant generic dashboard and not microservices.
2. Keep `/admin`; security does not depend on URL secrecy.
3. Payment status is Mercado Pago/provider-authoritative and cannot be manually forced by admin database edits.
4. Fulfillment is independent from payment and follows `awaiting_payment -> awaiting_production -> in_production -> ready_to_ship -> shipped -> completed`, with `canceled` as an exceptional terminal state.
5. Refund/chargeback creates attention but does not falsify the physical fulfillment stage.
6. Administrative and order history are append-oriented and auditable.
7. Customer address may be corrected before label purchase; after purchase it cannot silently diverge from the label.
8. Customer account uses email + permanent password + email verification + password recovery.
9. Email is unique; names are not identities; internally use immutable customer UUID.
10. Guest checkout remains supported.
11. Guest/old order claiming must use trusted proof, never a name match alone.
12. Customer permanent profile is minimal; payment-card data is never stored.
13. Customer and admin authorization remain completely separate.
14. Catalog moves to Supabase, but checkout remains server-authoritative and historical order snapshots remain immutable.
15. Static catalog authority is removed only after staged migration/equivalence validation and a rollback path.
16. Melhor Envio label permissions must be expanded with least privilege and verified against current provider docs at implementation time.
17. Label purchase never happens automatically after payment; it always requires explicit admin confirmation.
18. Tracking/read-only synchronization may be automatic when safe.
19. Transactional email uses an outbox/job model so provider failure cannot break payment/order state.
20. Store settings include only commercial/operational values; secrets remain environment/runtime configuration.
21. Admin UI follows the current visual model; customer account follows storefront visual identity.
22. Database migrations must be compatibility-first and additive before tightening constraints.
23. Existing orders must not receive fabricated production/shipping history.
24. `IMPLEMENTED`, `TESTED`, `PREVIEW APPROVED`, and `PRODUCTION APPROVED` are distinct states.
25. The executable master plan is created only after this design receives written-spec approval.

## 28. Written-spec review gate

No implementation code should begin from this design until the owner has reviewed this committed specification and explicitly approved moving to implementation planning.

After approval, the next workflow step is to create the detailed executable implementation/master plan with dependency-aware tasks, TDD checkpoints, migration sequencing, Preview acceptance gates, rollback steps, and continuation checkpoints.