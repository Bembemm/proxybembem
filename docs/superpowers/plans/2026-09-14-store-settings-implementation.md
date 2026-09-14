# Phase 7 Store Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace selected hardcoded commercial/operational store values with a typed, audited, admin-managed Store Settings subsystem while preserving all accepted payment, shipping, catalog, authentication and notification boundaries.

**Architecture:** Add one private singleton `public.store_settings` row with explicit typed columns and a service-role-only atomic update RPC. Keep validation in a pure TypeScript domain module, access Supabase only from server repositories, cache only the sanitized public projection, and invalidate that cache after successful admin updates. The protected admin page uses the existing owner/AAL2/admin-session and same-origin patterns. Public UI receives only allowlisted settings and falls back safely when the settings read is unavailable.

**Tech Stack:** Next.js 16.3.3 App Router, React 19, TypeScript 5.7.3, Tailwind CSS 4, Supabase/PostgreSQL, Node 22.1.0 production runtime, pnpm 10, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-14-store-settings-design.md`

## Global Constraints

- Branch remains `feat/phase-7-store-settings` until the owner explicitly approves integration.
- V1 contains exactly: `production_lead_time_business_days`, `contact_email`, `contact_whatsapp_e164`, `notice_enabled`, `notice_text`.
- No generic `key/value` table and no unrestricted JSON settings object.
- No Mercado Pago, Melhor Envio, Resend, Supabase, cron or KingHost secret becomes a store setting.
- No store-pause/payment-flow switch in V1.
- `public.products` remains the runtime catalog authority; saved product editorial text is not silently rewritten.
- Mercado Pago remains financial authority.
- Melhor Envio label spending remains explicit and fail-closed.
- Admin access remains owner UUID + password + TOTP/AAL2 + active server-side admin session.
- Browser roles receive no direct Store Settings CRUD.
- Security-definer SQL uses `set search_path = ''`, schema-qualified names, explicit revoke/grant.
- Admin mutations are same-origin, body-bounded, no-store and use optimistic concurrency.
- Public settings failure must not make the storefront, account pages or checkout unavailable.
- Public fallback is exactly: lead time 5, notice disabled, contact e-mail absent, WhatsApp absent.
- The database is seeded with the currently published contact values (`contato@proxybembem.com.br`, `+5544991250332`) so the successful migration/deploy path does not make existing contact affordances disappear.
- New database work is additive. Do not modify or reapply already-hosted migrations.
- Do not alter the KingHost deploy/publish-assets permission strategy or add `umask` hardening as part of Phase 7.
- Every code/DDL task follows RED -> verify exact failure -> minimal GREEN -> focused verification -> commit.
- Before ending any implementation session, update `docs/superpowers/phase-7/CONTINUIDADE.md` with real state and the next exact action.

---

### Task 1: Typed singleton schema and atomic audited update RPC

**Files:**
- Create: `tests/store-settings-migration.test.ts`
- Create: `supabase/migrations/202609140003_store_settings.sql`

**Interfaces:**
- Consumes: existing `public.admin_audit_log` and service-role-only RPC conventions.
- Produces: `public.store_settings` singleton row and `public.admin_update_store_settings(...)`.
- Initial row: `id='default'`, lead time `5`, current public contact e-mail/WhatsApp, notice disabled/null.

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/store-settings-migration.test.ts`. Read the migration file and assert at minimum:

```ts
assert.match(sql, /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.store_settings/i)
assert.match(sql, /id\s+text[^,]+primary\s+key/i)
assert.match(sql, /production_lead_time_business_days\s+integer\s+not\s+null\s+default\s+5/i)
assert.match(sql, /contact_email\s+text/i)
assert.match(sql, /contact_whatsapp_e164\s+text/i)
assert.match(sql, /notice_enabled\s+boolean\s+not\s+null\s+default\s+false/i)
assert.match(sql, /notice_text\s+text/i)
assert.match(sql, /updated_at\s+timestamptz/i)
assert.match(sql, /id\s*=\s*'default'/i)
assert.match(sql, /between\s+1\s+and\s+15/i)
assert.match(sql, /400/)
assert.match(sql, /254/)
assert.match(sql, /alter\s+table\s+public\.store_settings\s+enable\s+row\s+level\s+security/i)
assert.match(sql, /revoke\s+all\s+on\s+table\s+public\.store_settings\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i)
assert.match(sql, /function\s+public\.admin_update_store_settings/i)
assert.match(sql, /security\s+definer/i)
assert.match(sql, /set\s+search_path\s*=\s*''/i)
assert.match(sql, /for\s+update/i)
assert.match(sql, /p_expected_updated_at/i)
assert.match(sql, /insert\s+into\s+public\.admin_audit_log/i)
assert.match(sql, /'store_settings'/i)
assert.match(sql, /'update_store_settings'/i)
assert.match(sql, /grant\s+execute[^;]+to\s+service_role/i)
assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all)[^;]+public\.store_settings[^;]+to\s+(?:anon|authenticated)/i)
```

Also assert the migration seeds `contato@proxybembem.com.br`, `+5544991250332`, `notice_enabled=false`, and does not contain provider secret names such as `MERCADO_PAGO_ACCESS_TOKEN`, `RESEND_API_KEY`, `MELHOR_ENVIO_CLIENT_SECRET`, `SUPABASE_SECRET_KEY` or `CRON_SECRET`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --experimental-strip-types --test tests/store-settings-migration.test.ts
```

Expected: FAIL because `202609140003_store_settings.sql` does not exist or does not satisfy the contract.

- [ ] **Step 3: Implement the minimal additive migration**

Create `public.store_settings` with the exact V1 columns and checks. Use a canonical singleton identity:

```sql
id text primary key check (id = 'default')
```

Required checks:

- `production_lead_time_business_days between 1 and 15`;
- e-mail null or `btrim(value)=value`, no control characters and length <= 254;
- WhatsApp null or canonical E.164 `^\+[1-9][0-9]{7,14}$`;
- notice null or trimmed, no control characters, length <= 400;
- enabled notice requires non-empty `notice_text`.

Seed the single row with current public contact values. Enable RLS, revoke direct privileges from `public, anon, authenticated`, and explicitly grant only the server role access needed for server reads.

Create:

```sql
public.admin_update_store_settings(
  p_admin_user_id uuid,
  p_expected_updated_at timestamptz,
  p_production_lead_time_business_days integer,
  p_contact_email text,
  p_contact_whatsapp_e164 text,
  p_notice_enabled boolean,
  p_notice_text text
)
```

The function must:

1. lock `id='default'` with `FOR UPDATE`;
2. return a stable `conflict` outcome without mutating when `updated_at <> p_expected_updated_at`;
3. update only the five allowlisted values and set a fresh timestamp;
4. insert exactly one `admin_audit_log` row in the same transaction with `entity_type='store_settings'`, `entity_id='default'`, `action='update_store_settings'`, and explicit previous/new allowlisted JSON objects;
5. return `updated` plus the authoritative row;
6. never accept or record arbitrary metadata/secrets.

Revoke execute from `public, anon, authenticated`; grant execute only to `service_role`.

- [ ] **Step 4: Verify GREEN**

Run the focused test, then:

```bash
npx pnpm@10 typecheck
npx pnpm@10 test
```

- [ ] **Step 5: Commit**

Commit message: `feat: add typed store settings schema`

---

### Task 2: Pure Store Settings domain validation and row parsing

**Files:**
- Create: `lib/store-settings/store-settings.ts`
- Create: `tests/store-settings-domain.test.ts`

**Interfaces:**
- Produces `StoreSettings`, `PublicStoreSettings`, `StoreSettingsMutationInput`, `DEFAULT_PUBLIC_STORE_SETTINGS`.
- Produces `validateStoreSettingsMutationInput(value)`, `parseStoreSettingsRow(value)`, `toPublicStoreSettings(value)`, and a small public WhatsApp display helper if needed by UI.

- [ ] **Step 1: Write failing domain tests**

Cover:

- lead time accepts integers 1 and 15, rejects 0, 16, floats and strings;
- e-mail is optional, trimmed, lowercased, <=254 and must match the existing conservative `local@domain.tld` style validation;
- WhatsApp accepts only canonical E.164 with `+` and 8–15 digits, rejects spaces/parentheses/short/long/leading-zero international codes;
- notice max 400, trims surrounding whitespace, rejects control chars;
- `noticeEnabled=true` rejects empty/null notice;
- disabled empty notice normalizes to `null`;
- mutation objects containing extra keys such as `mercadoPagoAccessToken`, `secret`, `priceCents` or `shippingPrice` are rejected rather than ignored;
- persisted row requires `id='default'`, valid ISO timestamp, and the exact typed fields;
- `toPublicStoreSettings` drops `id`/`updatedAt`;
- default public projection is exactly lead `5`, contacts `null`, notice false/null.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test tests/store-settings-domain.test.ts
```

Expected: FAIL because the domain module is absent.

- [ ] **Step 3: Implement minimal pure domain module**

Keep this file free of Next.js, Supabase and environment imports so it is safe to share with client form validation. Use explicit key allowlisting and deterministic normalization.

Representative shape:

```ts
export const DEFAULT_PUBLIC_STORE_SETTINGS: PublicStoreSettings = {
  productionLeadTimeBusinessDays: 5,
  contactEmail: null,
  contactWhatsappE164: null,
  noticeEnabled: false,
  noticeText: null,
}
```

- [ ] **Step 4: Verify GREEN**

Run domain test plus full typecheck/test.

- [ ] **Step 5: Commit**

Commit message: `feat: validate store settings domain`

---

### Task 3: Server repository, safe public fallback and tagged cache

**Files:**
- Create: `lib/server/store-settings.ts`
- Create: `lib/server/store-settings-cache.ts`
- Create: `tests/store-settings-repository.test.ts`
- Create: `tests/store-settings-cache-contract.test.ts`

**Interfaces:**
- `getAdminStoreSettings(): Promise<StoreSettings>` — uncached authoritative admin read; failure throws.
- `readPublicStoreSettings(): Promise<PublicStoreSettings>` — strict storage read with safe fallback on network/status/malformed row.
- `getPublicStoreSettings(): Promise<PublicStoreSettings>` — cached public wrapper.
- `invalidatePublicStoreSettings(): void` — immediate tag invalidation after successful update.
- `updateAdminStoreSettings(...)` — calls the atomic RPC and maps `conflict` to `StoreSettingsConflictError`.

- [ ] **Step 1: Write failing repository tests**

Mock `globalThis.fetch` with `SUPABASE_URL=https://example.supabase.co` and a fake server key. Assert:

- table read path is `/rest/v1/store_settings` with `id=eq.default`, explicit select list and limit 1;
- no wildcard/raw row exposure;
- server key appears only in backend request headers;
- admin read uses `cache:'no-store'` and rejects network/non-2xx/malformed/missing singleton;
- public read returns the sanitized row on success;
- public read returns `DEFAULT_PUBLIC_STORE_SETTINGS` on network failure, non-2xx, missing row or malformed persisted data;
- update uses `/rest/v1/rpc/admin_update_store_settings`, exact RPC argument names and explicit allowlisted body;
- `outcome='conflict'` throws `StoreSettingsConflictError`;
- `outcome='updated'` returns the parsed authoritative row;
- provider/server error bodies are not included in thrown messages.

- [ ] **Step 2: Write failing cache contract test**

Source-test `lib/server/store-settings-cache.ts` and require:

```ts
unstable_cache
revalidate: 300
store-settings
revalidateTag
expire: 0
```

The cache wrapper must call only the public fallback reader, not the admin reader. Admin reads remain uncached.

- [ ] **Step 3: Verify RED**

Run both focused tests and confirm missing modules fail.

- [ ] **Step 4: Implement repository and cache wrapper**

Mirror the existing Supabase server REST posture: `getSupabaseEnv()`, 10-second timeout, bounded explicit fields, safe structured logging without row contents. Use Next 16 cache primitives in the isolated cache module:

```ts
unstable_cache(readPublicStoreSettings, ["public-store-settings"], {
  revalidate: 300,
  tags: ["store-settings"],
})
```

Invalidate after a successful mutation with immediate expiry:

```ts
revalidateTag("store-settings", { expire: 0 })
```

- [ ] **Step 5: Verify GREEN and commit**

Run focused tests, full typecheck/test, then commit:

`feat: add store settings repository and cache`

---

### Task 4: Protected admin update action and API route

**Files:**
- Create: `lib/server/admin-store-settings-actions.ts`
- Create: `app/api/admin/settings/route.ts`
- Create: `tests/admin-store-settings-routes.test.ts`

**Interfaces:**
- `createAdminStoreSettingsRouteHandler(deps)` for dependency-injected route tests.
- `PATCH /api/admin/settings` only.
- Body shape:

```ts
{
  expectedUpdatedAt: string,
  productionLeadTimeBusinessDays: number,
  contactEmail: string | null,
  contactWhatsappE164: string | null,
  noticeEnabled: boolean,
  noticeText: string | null
}
```

- [ ] **Step 1: Write failing action/route tests**

Match existing product-route security behavior. Cover:

- route wires `authorizeAdminAccess({ touch: true })`;
- cross-origin mutation is rejected before admin authorization;
- admin failures map to 401/403/503 and never invoke storage;
- bounded JSON body (use 16 KiB) returns 413 when exceeded;
- malformed JSON -> 400;
- missing/invalid `expectedUpdatedAt` -> structured 400;
- invalid field values -> `400 { error:'invalid_store_settings', fieldErrors }`;
- extra keys/secrets -> 400;
- successful PATCH passes `principal.userId`, expected revision and validated settings to repository;
- conflict -> `409 { error:'store_settings_conflict' }`;
- dependency failure -> 503;
- all responses include `Cache-Control: private, no-store`;
- cache invalidation is invoked only after a confirmed successful DB update, never on validation/conflict/failure.

- [ ] **Step 2: Verify RED**

Run focused test; expect missing action/route failure.

- [ ] **Step 3: Implement minimal handler and route**

Reuse `isAllowedCheckoutOrigin`/`resolvePublicSiteUrl`, `readJsonBody`, `authorizeAdminAccess`, domain validation, repository update and cache invalidation. Do not duplicate admin auth logic or accept browser-selected admin user IDs.

- [ ] **Step 4: Verify GREEN and commit**

Run route test, typecheck/full tests, commit:

`feat: add protected store settings mutation`

---

### Task 5: Protected `/admin/configuracoes` page and settings form

**Files:**
- Create: `app/admin/configuracoes/page.tsx`
- Create: `components/admin/settings/store-settings-form.tsx`
- Modify: `components/admin/admin-nav.tsx`
- Modify: `tests/admin-sidebar-ui.test.ts`
- Create: `tests/admin-store-settings-ui.test.ts`

**Interfaces:**
- New `AdminSection` value: `settings`.
- Navigation: `Configurações` -> `/admin/configuracoes`.
- Page reads authoritative settings only after `requireAdminPageAccess({ touch:true })`.
- Form PATCHes `/api/admin/settings` and retains/updates `expectedUpdatedAt` after success.

- [ ] **Step 1: Write failing nav/page/form tests**

Require:

- desktop/mobile shared nav contains `Configurações` and active settings semantics;
- settings page is `force-dynamic`, requires admin before `getAdminStoreSettings`, uses `AdminShell activeSection="settings"`;
- backend read failure renders a clear unavailable state and does not render an enabled save form based on defaults;
- form contains groups `Operação`, `Contato`, `Aviso da loja`;
- lead input min 1/max 15;
- e-mail input max 254;
- notice textarea max 400;
- WhatsApp help requires E.164 but user-facing copy can explain `+55...`;
- form sends expected revision and all five fields only;
- 400 field errors render next to fields;
- 409 shows the stable “alterado em outra sessão/recarregue” message;
- success replaces local `expectedUpdatedAt`, clears dirty state and does not reload blindly;
- before-unload dirty protection may follow the existing product form pattern.

- [ ] **Step 2: Verify RED**

Run new UI test and existing sidebar test; expect failures for missing page/nav/form.

- [ ] **Step 3: Implement admin page/form/nav**

Use the established violet/slate admin styling. Do not expose service data or raw RPC responses. Keep one explicit `Salvar configurações` action and no autosave.

- [ ] **Step 4: Verify GREEN and commit**

Run focused UI/sidebar tests, typecheck/full tests, commit:

`feat: add admin store settings page`

---

### Task 6: Public projection through root shell, dynamic FAQ, footer and store notice

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/site-shell.tsx`
- Modify: `components/faq-section.tsx`
- Modify: `components/footer.tsx`
- Create: `components/store-notice.tsx`
- Modify: `tests/brand-and-production-copy.test.ts`
- Create: `tests/public-store-settings-ui.test.ts`
- Verify: `tests/admin-auth-ui.test.ts`

**Interfaces:**
- Root layout loads `getPublicStoreSettings()` server-side and passes only `PublicStoreSettings` to `SiteShell`.
- `SiteShell` passes narrow props to FAQ/Footer/Cart and renders notice directly below navbar for non-admin routes.

- [ ] **Step 1: Write failing public shell tests**

Cover:

- `app/layout.tsx` imports/calls cached `getPublicStoreSettings` and passes projection to `SiteShell`;
- no Supabase/browser service credential code is imported by client components;
- FAQ takes `productionLeadTimeBusinessDays` and renders `1 dia útil` vs `N dias úteis` dynamically;
- old literal production-copy test is replaced with a dynamic contract plus default `5` assertion in the Store Settings domain test;
- footer receives nullable `contactEmail`/`contactWhatsappE164`, emits links only when values exist, and contains no hardcoded `5544991250332` or `contato@proxybembem.com.br`;
- `StoreNotice` renders text with ordinary JSX only; assert absence of `dangerouslySetInnerHTML`;
- notice is shown only when `noticeEnabled && noticeText`;
- existing SiteShell admin early return prevents storefront notice/footer/FAQ/cart from rendering on `/admin`.

- [ ] **Step 2: Verify RED**

Run focused public UI/copy tests.

- [ ] **Step 3: Implement minimal public projection flow**

Make root layout async, load cached settings once, pass them to `SiteShell`. Keep notice non-blocking and plain text. Update FAQ/Footer props without introducing any client DB request.

- [ ] **Step 4: Verify GREEN and commit**

Run public UI, brand/copy and admin-auth UI regressions, then full tests/build. Commit:

`feat: consume store settings in shared storefront`

---

### Task 7: Contact page, WhatsApp helper, cart fallback and customer-order support

**Files:**
- Modify: `lib/checkout.ts`
- Modify: `components/cart-panel.tsx`
- Modify: `components/order-summary.tsx`
- Modify: `app/contato/page.tsx`
- Modify: `components/pages/contact-page.tsx`
- Modify: `app/minha-conta/pedidos/[id]/page.tsx`
- Modify: `tests/customer-account-ui.test.ts`
- Create: `tests/store-settings-contact-links.test.ts`

**Interfaces:**
- Change helper to:

```ts
buildWhatsAppOrderUrl(
  destinationE164: string | null | undefined,
  message: string,
): string | null
```

- Contact and support affordances are conditional when contact settings are absent.

- [ ] **Step 1: Write failing helper/contact tests**

Assert:

- `buildWhatsAppOrderUrl('+5544991250332', 'Olá')` returns a `https://wa.me/5544991250332?text=...` URL;
- null/undefined/invalid destination returns `null` rather than malformed URL;
- destination is encoded only as digits in the path and message uses `encodeURIComponent`;
- `OrderSummary` accepts `whatsappFallbackUrl: string | null` and omits the fallback button when null;
- `CartPanel` receives the configured E.164 destination from `SiteShell` and never embeds a number;
- `/contato` loads public cached settings server-side and passes nullable contacts to `ContactPage`;
- ContactPage omits unavailable channel cards/buttons rather than generating broken `wa.me`/`mailto:` links;
- customer order detail loads public settings after customer ownership/auth is established, builds support URL with configured WhatsApp, and conditionally renders “Falar sobre este pedido” only when available;
- customer account tests continue to prove owner-scoped order reads and no admin data leakage.

- [ ] **Step 2: Verify RED**

Run focused contact/customer tests.

- [ ] **Step 3: Implement configured-contact flow**

Remove the hardcoded WhatsApp from `lib/checkout.ts`, footer/contact page and customer support path. Do not move customer-provided checkout WhatsApp into Store Settings; these are separate concepts.

- [ ] **Step 4: Verify GREEN and commit**

Run focused tests and full typecheck/test/build. Commit:

`feat: use configured public contact channels`

---

### Task 8: Branch-wide regression, documentation checkpoint and CI

**Files:**
- Modify: `docs/superpowers/phase-7/CONTINUIDADE.md`
- Modify: `docs/superpowers/CURRENT_STATUS.md`
- Modify: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- Do not yet mark Phase 7 production-accepted.

**Interfaces:**
- Canonical docs must distinguish `implementation complete / rollout pending` from hosted/Production acceptance.

- [ ] **Step 1: Run exact pre-rollout verification**

Run:

```bash
nvm use
node --version
npx pnpm@10 install --frozen-lockfile
npx pnpm@10 typecheck
NODE_ENV=production npx pnpm@10 build:kinghost
npx pnpm@10 test
```

Node must resolve to exactly `v22.1.0` for the KingHost runtime/build gate. Record actual test counts/results rather than copying old numbers.

- [ ] **Step 2: Inspect branch diff for scope/security regressions**

Verify no changes to payment authority, shipping spend gates, notification truth, secrets, `.env.production`, deploy asset permissions or historical migrations. Search the diff for provider secret names and the old hardcoded public contact values outside migration seed/history tests.

- [ ] **Step 3: Update docs with implementation evidence only**

Set Phase 7 to an honest state such as `IMPLEMENTATION COMPLETE / AUTOMATED GREEN / HOSTED ROLLOUT PENDING` if that is what the evidence supports. Update `CONTINUIDADE.md` with commits, files, tests, blockers and next exact hosted migration action.

- [ ] **Step 4: Push and wait for GitHub Actions**

Require CI success on the current branch HEAD before applying hosted DDL. If CI fails, use systematic debugging; do not roll forward to Supabase/KingHost.

- [ ] **Step 5: Commit documentation checkpoint**

Commit message: `docs: checkpoint Phase 7 implementation`

---

### Task 9: Hosted Supabase rollout and advisor verification

**Files:**
- No rewrite of repository migrations.
- Update after verification: `docs/superpowers/phase-7/CONTINUIDADE.md` and status docs with actual hosted evidence.

**Interfaces:**
- Apply only the new Store Settings migration to hosted project `ProxyBembem` after branch CI is green.

- [ ] **Step 1: Re-check hosted migration history before applying**

Confirm the Phase 7 migration is not already present and that no unexpected migration landed since the plan was written.

- [ ] **Step 2: Apply the additive Store Settings migration once**

Use the Supabase migration action, not an ad-hoc rewrite of old functions. Preserve the repo migration as the source artifact.

- [ ] **Step 3: Verify hosted database contract**

Read back:

- exactly one `store_settings` row with `id='default'`;
- RLS enabled;
- no anon/authenticated table CRUD;
- RPC exists, `SECURITY DEFINER`, fixed empty search path, service-role-only execute;
- seed preserves current contact values and notice is off;
- no provider secrets stored in the row/table.

Use a rollback-only transaction or safe controlled call to prove conflict and atomic audit semantics without leaving synthetic configuration changes behind.

- [ ] **Step 4: Re-run Supabase security/performance advisors**

Classify findings. Do not treat intentional backend-only “RLS enabled/no policy” INFO as a new regression. Confirm no new exposed grant, unsafe definer/search-path issue or missing FK/index problem caused by Phase 7.

- [ ] **Step 5: Update continuity with exact hosted evidence**

Record the actual hosted migration timestamp/name and verification results. Phase 7 remains deployment pending until KingHost runtime is updated and smoke-tested.

---

### Task 10: KingHost deployment, focused Production smoke and final Phase 7 handoff

**Files:**
- Final updates: `docs/superpowers/CURRENT_STATUS.md`
- Final updates: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- Final updates: `docs/PROJECT_MASTER_OVERVIEW.md`
- Final updates: `docs/superpowers/phase-7/CONTINUIDADE.md`

**Interfaces:**
- Use the existing KingHost runbook and normal deployment path only.
- During interactive SSH execution with the owner, issue **one command/action at a time** and wait for the result before the next action.

- [ ] **Step 1: Confirm deploy candidate**

Require current branch HEAD CI green and hosted migration verified. Record the exact candidate SHA.

- [ ] **Step 2: Deploy using the existing runbook without permission/umask changes**

Operational sequence is the existing normal flow:

```text
ssh -4 proxybembem@ftp.proxybembem.com.br
cd ~/apps_nodejs/proxybembem && git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 deploy:kinghost
```

Then restart via the KingHost panel. During the real session, do not send this as a multi-command dump; guide the owner one action at a time.

- [ ] **Step 3: Focused Production admin smoke**

With real admin login/TOTP:

1. open `/admin/configuracoes`;
2. confirm current seed values and lead time 5;
3. save one harmless reversible setting change (prefer notice text/enable or lead time only if the owner wants it visible);
4. confirm success and refreshed revision;
5. verify an audit row exists with only allowlisted previous/new values;
6. use two-tab/stale revision behavior or a controlled API/database check to prove 409 conflict without overwriting.

- [ ] **Step 4: Focused public smoke**

Verify:

- FAQ reflects configured lead time;
- configured contact e-mail/WhatsApp links work;
- store notice appears only when enabled and is plain text;
- admin pages do not show the storefront banner/footer/FAQ/cart;
- removing/temporarily nulling a contact through admin (only if owner chooses) does not create malformed links;
- `/produtos` still loads and cart/shipping quote render normally;
- payment behavior, Melhor Envio purchase controls and Phase 6 e-mail behavior were not changed by Phase 7.

Revert the harmless test setting if it was only temporary.

- [ ] **Step 5: Final verification before declaring complete**

Use the verification-before-completion workflow. Confirm the Production SHA, current CI result, hosted migration, settings row, admin/public smoke and no outstanding Phase 7 defect.

- [ ] **Step 6: Reconcile canonical docs**

Only now mark Phase 7 `COMPLETE / PRODUCTION ACCEPTED`. Update master overview/status/master plan and the continuity handoff with real evidence and set the next action to owner choice about Phase 8 or another explicitly requested task. Do not automatically start Phase 8.

- [ ] **Step 7: Integration decision remains explicit**

Open/update a Phase 7 PR if useful, but do not merge/squash/rebase/delete the branch unless the owner explicitly approves integration into `main`.
