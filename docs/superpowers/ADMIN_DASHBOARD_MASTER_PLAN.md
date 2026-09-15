# ProxyBembem Admin Dashboard Expansion — Master Plan

> **Operational source of truth.** Read with `docs/superpowers/CURRENT_STATUS.md` and `docs/PROJECT_MASTER_OVERVIEW.md`. Historical implementation plans/specs preserve their original RED/GREEN structure and are not retroactively treated as current checklists.

**Goal:** maintain a secure operational store dashboard and private customer account area without weakening checkout, Mercado Pago, Melhor Envio, Supabase or admin authentication.  
**Architecture:** modular monolith in the existing Next.js + Supabase application.  
**Active completed Phase 7 branch:** `feat/phase-7-store-settings`  
**Canonical integration branch:** `main`  
**Runtime:** KingHost Node.js **22.1.0** + hosted Supabase.

## Global invariants

- `/admin` security is authorization/MFA, not URL secrecy.
- Admin access requires immutable owner UUID, password, TOTP/AAL2 and active server-side admin session.
- Customer auth is separate from admin authorization.
- Browsing/cart/freight are public; payment start requires verified authenticated customer.
- Browser never chooses authoritative price, freight, total, payment state or customer ownership UUID.
- Mercado Pago remains payment authority.
- Existing orders remain immutable purchase-time snapshots.
- Customer order reads are owner-scoped and private.
- `/pedido/[token]`, guest claim and guest payment must not return.
- Existing Supabase project is evolved in place; already-applied migrations are never reapplied.
- Melhor Envio label purchase is always explicit and fail-closed; no render/webhook/cron/fulfillment event auto-spends.
- Notification failure never mutates financial/fulfillment/shipping truth.
- Store Settings never stores provider/infrastructure secrets.
- No merge, squash, rebase, branch deletion or force-move without explicit owner approval.

---

# PHASE 0 — Design + Planning

**State: COMPLETE.**

Approved modular-monolith architecture, branch/checkpoint system and security/payment/fulfillment/customer/catalog boundaries.

# PHASE 1 — Data + Audit Foundation

**State: COMPLETE / APPLIED / VALIDATED.**

Fulfillment state, append-only order events, attention flags and audit foundation are live. Mercado Pago financial authority and concurrency behavior remain preserved.

# PHASE 2 — Admin Orders + Fulfillment

**State: COMPLETE / ACCEPTED.**

`/admin/pedidos`, order detail and `/admin/producao` are implemented with narrow AAL2/same-origin actions, explicit cancellation confirmation and no local payment-state forgery.

# PHASE 3 — Customer Account + Private Owned Orders

**State: COMPLETE / DEPLOYED / PRODUCTION ACCEPTED.**

Verified-account payment start, private account-owned orders, server-derived ownership, owner-scoped list/detail reads, private Mercado Pago returns and durable password recovery are accepted in Production. Guest checkout/payment/public order tracking remain removed.

# PHASE 4 — Database Catalog + Admin Products + Admin Navigation

**State: IMPLEMENTATION COMPLETE / AUTOMATED GREEN / ORIGINAL FULL MANUAL PRODUCTION SMOKE NOT FULLY RE-RUN.**

Supabase `public.products` is the only runtime catalog authority. Product admin supports bounded create/edit/lifecycle operations with `draft | published | archived`, no hard delete, optimistic conflict protection and protected image upload. Global admin navigation is implemented for desktop/mobile.

The historical broad Stage 3 browser checklist was not fully re-run; later Production use must not be rewritten as evidence for every old item.

# PHASE 5 — Melhor Envio Shipments + Labels + Tracking

**State: COMPLETE / HOSTED MIGRATIONS APPLIED / PRODUCTION NON-SPENDING PATH VALIDATED / TASK 18 OWNER ACCEPTED / TASK 20 OWNER ACCEPTED.**

Phase 5 provides server-authoritative shipments, explicit preparation/purchase/generation/posting/cancellation, owner-safe customer tracking and a fail-closed Production spending gate.

The safe default remains:

```text
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false
```

No payment, render, cron, tracking or retry path may auto-enable/bypass spending. Provider-ambiguous mutations must be reconciled before retry.

## Phase 5 acceptance evidence preserved

Phase 5 is **complete / owner accepted** at the owner-handoff level.

- The controlled Production **non-spending / sem gasto** path reached the real Melhor Envio cart with the local shipment in `in_cart`; the accepted fixture cost was **R$ 23,69**; there was no purchased-order identity and no false `shipped` transition.
- Task 18 **owner accepted** on 2026-09-11 — the first explicit real-purchase path was **owner-reported** as accepted; the record does not invent provider evidence that was not captured independently.
- Task 19 **complete / concluída** — Phase 5 operational documentation was reconciled with the accepted architecture and evidence.
- Task 20 **owner accepted** on 2026-09-11 — final Production smoke was **owner-reported** by the proprietor.
- Outside deliberate purchase windows, `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` remains mandatory and fail-closed.

The historical broad Phase 4 smoke must not be inferred from this Phase 5 acceptance.

# PHASE 6 — Transactional Notifications

**State: COMPLETE / HOSTED HARDENING APPLIED / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN.**

Production-capable outbox + worker + Resend + signed webhook architecture is accepted. Exactly eight transactional types are supported: `payment_approved`, `production_started`, `ready_to_ship`, `shipped`, `delivered`, `canceled`, `refunded`, `charged_back`.

Open/Click Tracking remain OFF. Notification failure never changes payment, fulfillment or shipment truth. Phase 6 is integrated into `main` via merge `95ac936ca11dfd695734138e579eb97085714980`.

# PHASE 7 — Store Settings

**State: COMPLETE / HOSTED SUPABASE APPLIED + VALIDATED / PRODUCTION ACCEPTED / NOT YET INTEGRATED INTO MAIN.**

Detailed final evidence: `docs/superpowers/phase-7/FINAL_ACCEPTANCE.md`.

## V1 scope

Exactly five allowlisted settings:

- production lead time: 1–15 business days, default 5;
- optional public contact e-mail;
- optional public WhatsApp E.164;
- public notice enabled flag;
- optional plain-text notice up to 400 characters.

Out of scope: arbitrary settings, provider credentials, financial controls, auto-spend, global pricing and infrastructure secrets.

## Implemented architecture

- additive migration `supabase/migrations/202609140003_store_settings.sql`;
- singleton `public.store_settings` with typed constraints/RLS;
- browser roles have no direct CRUD;
- `admin_update_store_settings(...)` is service-role-only, `SECURITY DEFINER`, fixed empty `search_path`, optimistic and audit-atomic;
- TypeScript domain/repository/cache with safe public fallback;
- protected PATCH `/api/admin/settings` preserving owner/AAL2/admin-session/same-origin/no-store boundaries;
- protected `/admin/configuracoes` with explicit save, field errors and stale-revision conflict protection;
- root shell gets only sanitized public settings;
- FAQ, footer, public notice, `/contato`, cart fallback and private-order support consume only allowlisted projections;
- missing contacts are omitted instead of creating broken links;
- provider/infrastructure secrets remain env-only.

## Hosted rollout

- hosted migration: `20260915002740 store_settings`;
- singleton, constraints, RLS, grants and RPC contract validated;
- rollback-only hosted smoke proved successful update, revision advance, atomic allowlisted audit and stale conflict without leaving synthetic data;
- no Phase 7 security advisor regression requiring rollback was found.

## Final automated/runtime checkpoint

Accepted Production runtime:

`db4308296e9f2603e76ded4332394dd58c99a84c` — `fix: position store notice below fixed navbar`.

GitHub Actions CI #1589 / run `34918063220`: **PASS** on that SHA.

The final regression fixes the public notice position under the fixed navbar by matching navbar height `h-14 sm:h-16` with notice offset `top-14 sm:top-16`.

## Production acceptance

- candidate deployed through the existing KingHost runbook on Node 22.1.0;
- restart done through KingHost panel;
- homepage returned HTTP/2 200;
- temporary notice reached Production HTML;
- owner-provided screenshot confirmed the notice fully visible below the navbar after the final fix;
- owner manually validated stale two-tab conflict rejection in `/admin/configuracoes`;
- hosted state was checked after smoke and `notice_enabled=false` was confirmed.

Phase 7 has no remaining implementation or rollout task. Integration into `main` remains an explicit owner decision.

# PHASE 8 — Dashboard Metrics + Attention Center

**State: NOT STARTED.**

Planned direction: reliable DB-derived metrics and attention queues only; no fabricated counters or browser-derived financial/operational truth.

Do not start automatically from Phase 7 completion.

# PHASE 9 — Hardening + Final Rollout

**State: NOT STARTED.**

Final auth/isolation/origin/rate-limit/secret review, concurrency matrix, advisors, full regression suite, exact rollout SHA and explicit owner rollout approval. Known backlog includes leaked-password protection review, `customer_profiles` auth RLS initplan performance findings, historical broad Phase 4 smoke debt and manual authenticated no-store header observation.

---

## Decisions future chats must not rediscover

1. Architecture is a modular monolith.
2. Admin requires owner UUID + password + mandatory TOTP/AAL2 + active app session.
3. Mercado Pago remains payment authority; fulfillment does not forge financial truth.
4. Payment start requires verified customer identity; guest payment remains removed.
5. Customer order ownership comes only from trusted server identity/auth UUID.
6. Product authority is Supabase, not a hardcoded runtime catalog.
7. Product lifecycle is exactly `draft | published | archived`; no physical delete.
8. Checkout always re-resolves authoritative current data server-side.
9. Product image write access stays admin-authorized; service secrets never reach browser.
10. Melhor Envio spending is explicit and fail-closed behind `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED`.
11. Preparation, purchase, generation, printing, posting and cancellation are distinct operations.
12. Customer shipment tracking stays authenticated, owner-scoped and sanitized.
13. Hosted Supabase stays separate from KingHost; applied migrations are not reapplied.
14. KingHost Node.js 22.1.0 is the application runtime.
15. Phase 6 uses durable outbox + bounded retries + signed delivery webhooks; e-mail failure never mutates business truth.
16. Phase 6 has exactly eight transactional types and no open/click tracking or marketing automation scope.
17. Phase 7 Store Settings V1 is exactly five allowlisted fields and no provider secrets.
18. Public settings failures use safe server-side fallbacks; admin mutation remains fail-closed.
19. Integration/merge is an explicit owner decision.
20. Phase 8/9 do not start merely because Phase 7 reached Production acceptance.

## Current checkpoint

**Phase 0:** complete.  
**Phase 1:** complete/applied.  
**Phase 2:** complete/accepted.  
**Phase 3:** complete/deployed/production-accepted.  
**Phase 4:** implementation complete; automated green; broad historical manual smoke partially deferred.  
**Phase 5:** complete/owner-accepted.  
**Phase 6:** complete/production-accepted/integrated into `main`.  
**Phase 7:** complete/hosted Supabase validated/Production accepted on runtime `db430829...`; not yet integrated into `main`.  
**Phase 8–9:** not started.

**NEXT EXACT ACTION:** decide explicitly how to integrate/retain `feat/phase-7-store-settings`. Do not merge/delete the branch or begin Phase 8/9 without owner instruction.
