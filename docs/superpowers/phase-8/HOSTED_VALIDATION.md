# Phase 8 — Hosted Supabase Validation

**Date:** 2026-09-15  
**Branch:** `feat/phase-8-dashboard-metrics-attention`  
**Candidate reviewed before hosted rollout:** `8eea9342db63b51229ed980d6e4b9377ad1348de`

## Hosted migration

The additive Phase 8 migration was applied once to the hosted Supabase project as:

- hosted version: `20260915092352`
- hosted name: `dashboard_metrics_attention_center`
- repository migration: `supabase/migrations/202609150001_dashboard_metrics_attention_center.sql`

No prior migration was rewritten or reapplied.

## Function security validation

`public.admin_get_dashboard_snapshot()` was verified with the following hosted properties:

- `SECURITY DEFINER` enabled;
- fixed empty `search_path`;
- `anon` cannot execute;
- `authenticated` cannot execute;
- `service_role` can execute.

## Read-only reconciliation

The hosted dashboard snapshot was independently reconciled against the authoritative persisted rows. The checks all matched for:

- timezone contract (`America/Sao_Paulo`);
- orders created for calendar today/week/month;
- approved gross values from trusted Mercado Pago approval events;
- reversed values from trusted refund/chargeback events;
- current financial-risk counts;
- current fulfillment operation counts;
- unresolved attention totals by highest severity per order;
- top attention ordering/projection;
- approved-month product quantities from immutable `orders.items` snapshots.

No synthetic order, payment, shipment or attention mutation was required.

## Advisors

Post-migration security/performance advisors showed no new Phase 8-specific regression. Existing baseline findings remain, including backend-only RLS-without-policy informational findings, customer RPC warnings that predate Phase 8, leaked-password protection disabled, `customer_profiles` RLS init-plan performance findings, and informational unused indexes.

## Remaining gate

Phase 8 is not Production-accepted yet. The remaining closeout gate is one Vercel deployment of the final CI-green candidate, followed by authenticated `/admin` smoke/reconciliation and creation of `FINAL_ACCEPTANCE.md`.

Phase 9 remains **NOT STARTED**.
