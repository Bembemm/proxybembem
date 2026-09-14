# ProxyBembem — Phase 7 Store Settings Design

**Date:** 2026-09-14  
**Branch:** `feat/phase-7-store-settings`  
**Base:** `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`  
**Status:** approved in chat; awaiting final written-spec review before implementation planning.

## 1. Goal

Phase 7 introduces a small, typed and explicitly allowlisted store-settings subsystem for operational/commercial values that are currently hardcoded in the application.

The first version must improve maintainability without turning settings into a generic configuration bucket and without allowing infrastructure secrets, payment authority, shipment spending controls or arbitrary runtime behavior to move into the database/UI.

## 2. Scope of V1

V1 contains exactly these settings:

- `production_lead_time_business_days` — integer, 1 to 15, default `5`;
- `contact_email` — optional public contact e-mail;
- `contact_whatsapp_e164` — optional public WhatsApp number stored canonically in E.164 format;
- `notice_enabled` — boolean, default `false`;
- `notice_text` — optional plain-text storefront notice, maximum 400 characters.

The administrative UI lives at `/admin/configuracoes` and is exposed in the protected admin navigation as `Configurações`.

## 3. Explicitly out of scope

The following do not become store settings in Phase 7 V1:

- Supabase keys, service-role credentials or database connection secrets;
- Mercado Pago tokens, webhook secrets, payment-state controls or financial authority;
- Melhor Envio OAuth credentials, token-encryption keys, provider identities or automatic-spend controls;
- Resend API key, webhook signing secret or tracking controls;
- `CRON_SECRET` or KingHost/runtime secrets;
- CPF/CNPJ or private provider metadata;
- product prices, checkout totals or manual freight prices;
- automatic label purchase/generation/posting controls;
- a generic `key/value` or unrestricted JSON settings store;
- a V1 “pause store/checkout” switch, because that alters the payment flow and requires its own dedicated design/testing;
- silent rewriting of historical product content or order snapshots.

Infrastructure secrets remain environment-only.

## 4. Design choice

The approved model is a **singleton typed table**, not a generic settings table.

`public.store_settings` contains one logical row representing the current store-wide configuration. Each setting has a dedicated typed column and database constraint. This keeps the schema self-documenting, prevents arbitrary new keys from appearing without migration/review, and lets database constraints backstop TypeScript validation.

The row is updated optimistically using `updated_at` so two open admin tabs cannot silently overwrite one another.

## 5. Data model

The intended columns are:

- `id text primary key` constrained to the single canonical value `default`;
- `production_lead_time_business_days integer not null default 5`;
- `contact_email text null`;
- `contact_whatsapp_e164 text null`;
- `notice_enabled boolean not null default false`;
- `notice_text text null`;
- `updated_at timestamptz not null`.

The migration inserts exactly one initial row with `id = 'default'`.

Database checks must enforce at minimum:

- `id = 'default'`;
- production lead time between 1 and 15 inclusive;
- `contact_email` is null or trimmed, contains no control characters and is at most 254 characters;
- `contact_whatsapp_e164` is null or matches canonical E.164 shape `+` followed by 8–15 digits, with the first digit non-zero;
- `notice_text` is null or trimmed, contains no control characters and is at most 400 characters;
- `notice_enabled = true` requires a non-empty valid `notice_text`.

Application validation must be at least as strict as the database checks. E-mail syntax validation is performed in the application; the database provides boundedness/safety checks rather than attempting full RFC e-mail parsing.

## 6. Security model

`store_settings` is not a browser-editable table.

Requirements:

- RLS enabled;
- no direct `INSERT`, `UPDATE` or `DELETE` for `anon` or ordinary `authenticated` roles;
- no unrestricted browser `SELECT` dependency;
- administrative mutation only through a backend-only RPC/service path protected by the existing admin authorization model;
- `SECURITY DEFINER` functions use the existing fixed empty `search_path` convention and narrow backend-only grants;
- admin page/action responses remain `private, no-store`;
- mutation requires the same-origin check and active admin authorization used by existing protected actions;
- request bodies remain bounded and server-validated.

No secret or private provider value is ever returned through the public projection.

## 7. Administrative update flow

The admin settings page loads the authoritative current row and renders three setting groups in one form:

1. **Operação** — production lead time;
2. **Contato** — e-mail and WhatsApp;
3. **Aviso da loja** — enable/disable and notice text.

The save request includes `expectedUpdatedAt`.

The backend validates the complete proposed value. The database mutation must compare the expected revision before update. If the row changed since the page loaded, the action returns a conflict and the UI instructs the owner to reload rather than overwriting newer changes.

The mutation and its audit record are atomic. A backend-only database RPC updates the singleton row and writes one corresponding `admin_audit_log` record in the same transaction.

Audit shape:

- `entity_type`: `store_settings`;
- `entity_id`: `default`;
- action: `update_store_settings`;
- previous allowlisted values;
- new allowlisted values;
- admin user id;
- no secrets or unrelated request metadata.

## 8. Public read model

Public pages do not receive the raw database row.

A server-only settings repository returns a typed, sanitized projection containing only:

- production lead time;
- optional public e-mail;
- optional public WhatsApp;
- notice enabled flag;
- optional notice text.

On transient read failure, the public site must remain available with safe defaults:

- production lead time: `5` business days;
- notice: disabled;
- contact e-mail: absent;
- WhatsApp: absent.

An unavailable settings read must not break catalog browsing, customer account pages or checkout rendering. Admin read failure is different: the admin page must show an unavailable/error state and must not permit a blind save based on fabricated defaults.

## 9. Server/client boundary and caching

The settings lookup stays on the server. No Supabase service credential or direct private-table access reaches client components.

The root server layout is the natural boundary for loading the public settings projection and passing it into the existing client `SiteShell`. `SiteShell` can then pass only the required values to client components such as FAQ, footer, cart and storefront notice.

The implementation uses bounded server-side caching supported by the current Next.js 16 runtime and explicit invalidation/revalidation after a successful admin update so changes become visible promptly without adding an uncached database roundtrip to every public render.

The exact cache primitive is an implementation detail chosen in the plan against the current Next.js API, but the contract is fixed: public reads may be cached, successful writes invalidate them, and admin reads remain uncached/no-store.

## 10. Storefront consumers

### Production lead time

The shared FAQ currently hardcodes “5 dias úteis”. It must instead render from `production_lead_time_business_days`, preserving singular/plural wording if necessary.

The global setting does **not** silently rewrite existing product descriptions/sections that contain their own editorial text such as “5 dias úteis”. Existing product rows remain historical/editorial content until explicitly edited through product management.

### WhatsApp

The current public/support WhatsApp number is hardcoded in multiple locations. Phase 7 replaces those shared hardcoded contact destinations with the settings projection where practical, including:

- contact page;
- footer;
- customer order support link;
- cart/order WhatsApp fallback helpers.

The URL/message helper accepts the sanitized WhatsApp destination rather than embedding a global number internally.

If no public WhatsApp is available because the setting is empty or a settings read failed, the UI must not emit a malformed `wa.me` link. Contact affordances are omitted or gracefully disabled instead.

### Contact e-mail

Where public contact e-mail is displayed, the settings projection becomes the single source of truth. Missing e-mail must not create a broken `mailto:` URL.

### Store notice

When `notice_enabled` is true and `notice_text` is valid, the storefront shows a simple text-only banner directly below the main navbar.

The notice must:

- render plain text only;
- never inject arbitrary HTML;
- be visually noticeable but non-blocking;
- not appear in `/admin`;
- not alter checkout/payment state or create an operational gate.

## 11. Existing architecture preserved

Phase 7 must not weaken any accepted invariant from Phases 0–6:

- browser is never authority for price, freight, totals, ownership or payment state;
- `public.products` remains runtime catalog authority;
- Mercado Pago remains financial authority;
- authenticated/verified customer requirement for payment remains unchanged;
- private customer order ownership remains unchanged;
- admin still requires owner UUID + password + TOTP/AAL2 + active server-side admin session;
- product lifecycle remains `draft | published | archived` with no hard delete;
- Melhor Envio spending remains explicit and fail-closed;
- notification failure remains isolated from financial/fulfillment/shipping truth;
- Resend Open/Click Tracking remain off;
- already-applied migrations are never rewritten.

## 12. Error handling

### Admin

- invalid fields -> `400` with field-level validation feedback;
- stale `expectedUpdatedAt` -> `409` conflict;
- unauthorized/not-admin -> existing `401/403` semantics;
- backend dependency unavailable -> `503`;
- all protected responses remain no-store.

The UI must keep the last authoritative loaded values visible on validation error where feasible and must not claim success until the database update and audit record both succeed.

### Public site

- database/settings outage -> safe defaults;
- malformed persisted data -> reject/sanitize and fall back rather than pass malformed values to client code;
- absent contact setting -> omit/disable the corresponding contact link;
- notice invalid or absent -> notice hidden.

## 13. Testing strategy

Implementation follows TDD.

Coverage must include:

- migration/schema contract for singleton, constraints, RLS and grants;
- public projection validation and safe fallback behavior;
- admin read/update repository behavior;
- admin update RPC transaction/audit behavior;
- optimistic concurrency conflict;
- same-origin/admin authorization and bounded request body;
- settings form validation;
- admin navigation entry and protected `/admin/configuracoes` page;
- FAQ consuming dynamic lead time instead of a literal global value;
- WhatsApp helpers taking a configured destination and handling absence safely;
- contact/footer/customer-order links using the settings projection;
- storefront banner visible only when enabled with valid plain text;
- no settings banner on admin routes;
- no secret/provider settings introduced into V1;
- existing checkout/payment/shipping/notification tests remain green.

The old test that asserts literal five-day production copy must be rewritten to assert dynamic settings behavior while preserving `5` as the safe default.

## 14. Rollout

1. Implement and verify locally/CI on `feat/phase-7-store-settings`.
2. Apply only the new additive Phase 7 migration(s) to the hosted Supabase project after the migration contract is green.
3. Re-run security/performance advisors and confirm no unintended browser grants or policy regressions.
4. Deploy the application candidate to KingHost using the existing deployment runbook.
5. Smoke `/admin/configuracoes` with real admin auth/TOTP.
6. Change a harmless setting and verify persistence, conflict/audit behavior and public propagation.
7. Verify FAQ/contact/banner behavior and verify checkout/payment/shipping flows remain unchanged.
8. Record observed evidence in `CURRENT_STATUS.md`, master plan and `docs/superpowers/phase-7/CONTINUIDADE.md`.

Phase 7 is not marked complete until hosted migration, application deployment and targeted Production smoke are accepted.

## 15. Completion criteria

Phase 7 V1 is complete when all of the following are true:

- typed singleton settings schema applied;
- RLS/grants verified;
- public projection and safe defaults implemented;
- protected admin settings page implemented;
- update validation, atomic audit and optimistic concurrency implemented;
- admin navigation includes Configurações;
- FAQ uses configured production lead time;
- configured WhatsApp/e-mail are used by shared public contact surfaces without malformed fallback links;
- storefront notice works only when explicitly enabled;
- automated suite/CI green on the KingHost Node 22.1.0 gate;
- hosted Supabase migration/advisors verified;
- KingHost deployment and focused Production smoke accepted;
- `CONTINUIDADE.md` and canonical project status documents updated with real evidence.
