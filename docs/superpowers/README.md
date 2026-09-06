# ProxyBembem Engineering Continuity

Always start with:

- `docs/superpowers/CURRENT_STATUS.md`
- `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`

`CURRENT_STATUS.md` is the canonical continuation checkpoint. It records the verified live state, active branch/runtime, completed phase, validation evidence, blockers and the exact next action.

## Current project/runtime

- active feature branch: `feat/admin-dashboard-expansion`;
- production application runtime: KingHost Node.js 22.1.0;
- database/Auth backend: hosted Supabase project, kept separate from KingHost;
- canonical KingHost deployment runbook: `docs/deployment/kinghost.md`;
- Phase 3 customer accounts/private orders: COMPLETE and production-accepted;
- Phase 4: unblocked but not started until the owner chooses branch integration handling.

## Do not infer live progress from old checkboxes

Files under `docs/superpowers/plans/` and `docs/superpowers/specs/` are implementation/design artifacts. They intentionally preserve historical requirements and RED/GREEN planning structure. Many were written before implementation and their `- [ ]` markers were not retroactively checked.

Treat those checkboxes and historical architecture statements as **history**, not live state, whenever they conflict with `CURRENT_STATUS.md` or the current Master Plan.

Important supersessions include:

- the 2026-08-28 static Melhor Envio bearer-token plan was superseded by the approved single-account OAuth lifecycle;
- Vercel runtime/deployment instructions were superseded by KingHost and `docs/deployment/kinghost.md`;
- the original Phase 3 guest checkout + `/pedido/[token]` model was superseded before launch by `2026-09-06-authenticated-checkout-private-orders-design.md`;
- the earlier Supabase TokenHash password-recovery design was superseded by the durable application-owned recovery-grant design.

Do not edit historical plans/specs merely to make their old narrative look current. Update operational docs instead.

## Resume order

1. Read `CURRENT_STATUS.md`.
2. Read the Master Plan current checkpoint/invariants.
3. Verify the real branch HEAD and GitHub CI state.
4. If runtime work is involved, verify KingHost/Supabase state relevant to that task.
5. Read only the current/superseding plan/spec relevant to the next action.
6. Continue the task identified in `CURRENT_STATUS.md`.
7. Do not redo completed migrations/provider/production acceptance unless a regression or explicit new operation requires it.

## End-of-session rule

After any meaningful implementation, acceptance test, blocker or decision, update `CURRENT_STATUS.md` before ending the session with:

- current branch/HEAD or relevant runtime candidate;
- completed task/phase;
- verification evidence;
- blocker/status;
- exact next action;
- provider/database/hosting caveats future sessions must preserve.

## Safety / rollout constraints

- Work on `feat/admin-dashboard-expansion` until the owner explicitly chooses another branch/integration strategy.
- Never merge, squash, rebase, delete or force-move the feature branch without explicit owner approval.
- Never write provider/Supabase secrets, passwords, recovery tokens, TOTP material or customer-private identifiers into docs, commits, logs, screenshots or chat.
- Do not reapply already-applied Supabase migrations.
- Do not restore guest checkout/payment, `/pedido/[token]` or guest-claim application surfaces.
- Do not start Phase 4 automatically before the owner chooses how to integrate/preserve the completed Phase 3 branch.
