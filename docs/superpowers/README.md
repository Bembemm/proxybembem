# ProxyBembem Engineering Continuity

Always start with:

- `docs/superpowers/CURRENT_STATUS.md`
- `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`

`CURRENT_STATUS.md` is the canonical continuation checkpoint. Historical files under `docs/superpowers/plans/` and `docs/superpowers/specs/` preserve implementation/design history and may contain unchecked RED/GREEN steps even after work has been completed.

## Current project/runtime

- active feature branch: `feat/admin-dashboard-expansion`;
- base branch: `main`;
- production app: KingHost Node.js 22.1.0;
- backend/Auth: hosted Supabase, separate from KingHost;
- deploy runbook: `docs/deployment/kinghost.md`;
- Phase 3 customer accounts/private orders: complete and production-accepted;
- Phase 4 Supabase catalog + protected product admin + admin sidebar redesign: implementation complete and automatically verified;
- final Phase 4 browser production smoke: explicitly deferred by the owner on 2026-09-08 and still required before full production sign-off;
- Phase 5 must not start automatically before branch integration choice.

## Do not infer live progress from old checkboxes

When old plans/specs conflict with `CURRENT_STATUS.md` or the Master Plan, use the operational docs. Do not rewrite historical plans merely to make old checkboxes look current.

Important supersessions:

- Vercel deployment instructions were replaced by KingHost;
- the original guest checkout/public-token order model was replaced by authenticated payment start + private account orders;
- old password-recovery approaches were replaced by the durable application-owned grant flow;
- the static runtime product catalog was replaced by Supabase `public.products`;
- the old admin top navigation was replaced by the shared desktop sidebar/mobile drawer.

## Resume order

1. Read `CURRENT_STATUS.md`.
2. Read the Master Plan checkpoint/invariants.
3. Verify the real feature-branch HEAD and CI status.
4. For runtime/database work, verify relevant KingHost/Supabase live state.
5. Read only the current plan/spec needed for the next action.
6. Do not redo completed migrations or accepted production checks unless a regression or explicit operation requires it.
7. If Phase 4 is being signed off for Production, run the deferred browser smoke first.

## End-of-session rule

After meaningful implementation, acceptance, blocker or decision, update `CURRENT_STATUS.md` with exact SHA, verification evidence, runtime/database caveats and the exact next action.

## Safety / rollout constraints

- Work on `feat/admin-dashboard-expansion` until the owner explicitly chooses integration handling.
- Never merge, squash, rebase, delete or force-move the feature branch without explicit owner approval.
- Never expose provider/Supabase secrets, passwords, recovery tokens, TOTP material or customer-private identifiers.
- Never reapply already-applied Supabase migrations.
- Keep Supabase as the product runtime authority; do not restore the static catalog fallback.
- Do not restore guest checkout/payment, `/pedido/[token]` or guest-claim application surfaces.
- Do not start Phase 5 automatically before the owner chooses whether to merge, create a PR or keep the branch.
- The deferred manual production smoke must be remembered before declaring Phase 4 fully production-accepted.
