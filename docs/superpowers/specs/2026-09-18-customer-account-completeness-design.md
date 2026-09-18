# Customer Account Completeness Design

## Goal

Complete the customer-facing account lifecycle without changing the existing Mercado Pago, Melhor Envio, order ownership, or fulfillment truth models.

This feature set covers six approved improvements:

1. Request order cancellation through WhatsApp from the customer order page.
2. Require the current password for an authenticated password change.
3. Allow resending the signup confirmation email.
4. Add a privacy/account-deletion request entry point.
5. Allow authenticated email changes through Supabase's confirmation flow.
6. Add saved customer addresses and reuse them during checkout.

## Guardrails

- Work only on `feat/customer-account-completeness` until the branch is reviewed.
- Do not apply a production database migration as part of branch implementation.
- Do not change Mercado Pago payment/refund semantics.
- Do not automatically cancel orders, refund payments, cancel Melhor Envio labels, or delete financial/order history.
- Do not let an account email change rewrite historical order email snapshots.
- Do not let an address edit rewrite historical order address snapshots.
- All account mutations remain same-origin, bounded-body, rate-limited, authenticated where applicable, and `Cache-Control: private, no-store`.
- Customer-owned database rows use RLS ownership checks; no broad anonymous/authenticated mutation grants.
- New destructive or sensitive actions require explicit confirmation in the UI.

## 1. Customer order cancellation request

The existing order detail page keeps the general support action and the new list/art WhatsApp action.

Add a secondary destructive-looking but non-destructive action, **Solicitar cancelamento**, only while the order is still operationally eligible for a cancellation discussion (before `shipped`, `completed`, or `canceled`).

The action opens the configured store WhatsApp with a prefilled message containing the order number. It does **not** mutate `fulfillment_status`, payment state, or shipment state.

This preserves the existing separation:

- order operational cancellation;
- Mercado Pago refund/reversal;
- Melhor Envio shipment/label cancellation.

## 2. Authenticated password change

The normal account Security page will require:

- current password;
- new password;
- confirmation of new password.

Use the current Supabase Auth capability `updateUser({ password, current_password })`. The installed `@supabase/supabase-js` version is new enough for this capability.

The recovery-password flow remains separate and continues to accept only a new password after the recovery grant has been validated.

Rules:

- current password is required only for the normal authenticated password-change route;
- the current password is never logged or persisted;
- new password keeps the existing ProxyBembem password policy;
- error responses stay generic enough not to leak sensitive authentication state.

## 3. Resend signup confirmation

Add a small resend form to the **Confira seu e-mail** page.

The customer re-enters the signup email instead of placing an email address in the URL or retaining it indefinitely in browser storage.

Server route:

- accepts only an email;
- same-origin check;
- bounded JSON body;
- dedicated rate-limit scope;
- calls Supabase `auth.resend({ type: "signup", email, options: { emailRedirectTo } })`;
- returns the same neutral success response whether or not the address is useful to an attacker.

The callback remains the existing ProxyBembem confirmation callback.

## 4. Privacy / account deletion request

This release adds **Solicitar exclusão da conta** as a support/privacy workflow, not instant destructive deletion.

The Security page will contain a clearly separated **Privacidade** card. The customer must explicitly confirm they understand that order/payment records may need to be retained for support, accounting, fraud prevention, or legal obligations.

After confirmation, the action opens WhatsApp with a prefilled privacy/deletion request referencing the authenticated account email. It does not directly delete `auth.users`, orders, shipment history, audit logs, payment records, or transactional notification history.

Rationale: immediate self-service deletion would require a separate retention/anonymization policy and reconciliation rules across payments, shipping, invoices, and support history. The approved customer need is satisfied safely by making the request obvious and easy while keeping destructive handling deliberate.

## 5. Change account email

The Security page will add an email-change form with:

- current email shown read-only;
- new email;
- current password;
- explicit submit action.

Before requesting the email change, the server verifies the current password against the currently authenticated/confirmed email using an isolated Supabase Auth client whose session is not persisted into the browser response.

After that verification, the authenticated server client calls `auth.updateUser({ email: newEmail })`.

Supabase email-change confirmation remains authoritative. The UI must not claim the email changed until Supabase has confirmed it.

The implementation assumes **Secure email change** remains enabled in the Supabase project so confirmation is required on the configured addresses. The UI wording stays generic enough to remain correct if provider configuration changes.

Historical orders keep their original `customer_email` snapshot. Future checkouts use the verified current account email.

## 6. Saved addresses

### Data model

Add `public.customer_addresses` with:

- `id uuid primary key`;
- `customer_id uuid not null references auth.users(id) on delete cascade`;
- `label text not null` (for example Casa, Trabalho);
- `cep text not null`;
- `street text not null`;
- `number text not null`;
- `complement text null`;
- `neighborhood text not null`;
- `city text not null`;
- `state text not null`;
- `is_default boolean not null default false`;
- `created_at timestamptz`;
- `updated_at timestamptz`.

Constraints bound field lengths and normalize the state to two uppercase letters. CEP is stored as eight digits.

A customer may own multiple addresses. At most one address is default per customer, enforced with a partial unique index on `customer_id where is_default`.

RLS:

- authenticated customers can select only rows where `customer_id = auth.uid()`;
- insert requires `customer_id = auth.uid()`;
- update requires ownership in both `USING` and `WITH CHECK`;
- delete requires ownership;
- no access for `anon`.

### Server boundary

Create a focused customer-address module for normalization/parsing and production Supabase dependencies.

Expose same-origin account routes for create/update/delete/default selection. Read access can be server-side from the authenticated checkout/account pages.

Limit the number of saved addresses per account to a small bounded number (5) to keep the UX simple and prevent unbounded account-owned storage.

### Account UI

Add **Endereços** to the Minha Conta navigation.

The page supports:

- list saved addresses;
- add address;
- edit address;
- set default;
- delete address with confirmation.

### Checkout integration

When an authenticated customer opens checkout:

- saved addresses are available as quick-select options;
- the default address is preselected/prefilled when the checkout does not already have a preserved login draft;
- selecting another saved address fills the existing checkout fields;
- the customer can still type a different one-off address.

The checkout payload continues to contain an address snapshot. Checkout never trusts an address ID as the shipping destination authority and never makes historical orders depend on mutable address-book rows.

## Navigation and UX

Customer account navigation becomes:

- Minha conta
- Pedidos
- Perfil
- Endereços
- Segurança
- Sair

Security page becomes three clear areas:

1. **E-mail de acesso** — current email + alter email.
2. **Senha** — current password + new password.
3. **Privacidade** — request account deletion/support.

Order detail keeps support actions concise and does not duplicate operational status controls intended for admin.

## Error handling and security

- All sensitive endpoints fail closed on missing/invalid authentication.
- New routes use existing origin-validation and request-body helpers.
- Dedicated rate-limit scopes are added for confirmation resend and email change; address writes reuse a bounded account mutation scope or dedicated address scope.
- Password/email endpoints never log password values, auth codes, tokens, confirmation links, or session cookies.
- Email change and confirmation resend responses avoid account-enumeration leaks.
- RLS tests prove cross-account address reads/writes fail.
- Address payloads are normalized and length-bounded before hitting Postgres.
- The server never performs arbitrary URL fetches as part of these flows.

## Testing

Implementation follows the repository's existing Node test style and adds focused tests for:

- cancellation WhatsApp visibility/message;
- normal password change requiring `currentPassword` while recovery remains unchanged;
- resend-confirmation input, neutral response, rate limiting, and redirect target;
- email change requiring current password and preserving order snapshots;
- address input normalization and ownership;
- migration RLS/grants/index constraints;
- account address UI;
- checkout default-address prefilling without overriding a preserved checkout draft;
- account navigation;
- privacy/deletion request remaining non-destructive.

Before the branch is considered complete:

- lint;
- typecheck;
- focused tests;
- full test suite;
- build;
- GitHub CI.

## Supabase compatibility notes

Current Supabase documentation confirms:

- `auth.resend({ type: "signup", ... })` for signup confirmation resend;
- `auth.updateUser({ email })` for authenticated email changes;
- `auth.updateUser({ password, current_password })` for current-password validation during password changes in supported supabase-js versions.

No production Supabase configuration or schema is changed until the branch migration and application code are reviewed.
