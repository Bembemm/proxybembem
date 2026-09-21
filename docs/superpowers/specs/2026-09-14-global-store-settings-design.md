# Global Store Settings Sync Design

## Goal

Make the Phase 7 store settings the single public source of truth for production lead time, support email, support WhatsApp, and the store notice, while preserving the existing validation, cache, optimistic-concurrency, and admin security boundaries.

## Scope

- Keep the existing `store_settings` schema and hosted migration unchanged.
- After a successful admin settings save, refresh the current App Router tree so client-side navigation cannot keep an older root-layout projection alive.
- Remove hard-coded public support email usage from Privacy and Exchanges/Refunds and read the configured public settings instead.
- Make product-detail lead-time presentations use the configured global production lead time instead of stale catalog copy, including the `PRAZO` section and the existing `Produção em até N dias úteis` quick-info highlight.
- Keep existing product data unchanged in the database; the public renderer owns the global override.
- Preserve nullable contact behavior: when a channel is not configured, public pages must not invent or expose a fallback address/number.

## Architecture

`lib/store-settings/store-settings.ts` remains the domain boundary for the public settings shape and validation. Public server pages continue to read through `getPublicStoreSettings()` so the existing `unstable_cache` tag and admin invalidation remain authoritative.

The admin form calls `router.refresh()` only after a successful durable save. This refresh is a presentation synchronization step; it does not replace cache invalidation and does not run on validation errors, conflicts, or failed saves.

Privacy and Exchanges/Refunds are async server pages and conditionally render the configured support email. Product-listing server pages read the cached production lead time and pass it through their client page component to `ProductDetailModal`.

The modal replaces only catalog copy that is unambiguously a production lead-time presentation: sections whose normalized title is exactly `PRAZO`, and quick-info highlights matching the existing `Produção em até N dia(s) útil(eis)` format. Other highlights, details, notices, descriptions, and sections remain untouched.

## Safety and non-goals

- No Supabase migration or database mutation is part of this change.
- No admin setting values are changed by this work.
- Transactional sender addresses such as `noreply@proxybembem.com.br`, infrastructure URLs, customer-provided email/phone fields, shipping delivery estimates, docs, tests/fixtures, and historical migration seed text are not store contact/lead-time presentation and must not be rewritten.
- No HTML injection is introduced; settings continue to render as plain React text/attributes.
- Existing optimistic-concurrency behavior stays unchanged.

## Verification

Tests must prove that successful admin saves refresh the router, policy pages no longer contain a hard-coded public support email, and every known public product production-lead-time presentation uses the global setting while unrelated catalog content is left unchanged. Full CI must remain green on the Vercel runtime contract before the original Phase 7 branch is advanced.