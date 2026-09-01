# ProxyBembem Engineering Continuity

For checkout, Mercado Pago, Supabase and Melhor Envio work on `feat/checkout-mercadopago`, always start with:

- `docs/superpowers/CURRENT_STATUS.md`

That file is the live continuation checkpoint. It records the current branch/HEAD, the last completed task, the current task, validation evidence, blockers and the exact next action.

## Do not infer live progress from old checkboxes

The files under `docs/superpowers/plans/` are implementation/design artifacts. Some were written before implementation and their `- [ ]` markers were not retroactively checked as code was completed. Treat those checkboxes as historical planning structure unless `CURRENT_STATUS.md` says otherwise.

In particular, the original 2026-08-28 manifest initially selected a static Melhor Envio bearer-token approach. That decision was later superseded by the approved single-account OAuth design and implementation from 2026-08-29.

## Resume order

1. Read `CURRENT_STATUS.md`.
2. Verify the real branch HEAD and CI/Vercel state.
3. Read only the plan/spec relevant to the current task.
4. Continue the task identified in `CURRENT_STATUS.md`.
5. Do not redo completed provider/local acceptance work unless a regression requires it.

## End-of-session rule

After any meaningful implementation, acceptance test, blocker or decision, update `CURRENT_STATUS.md` before ending the session with:

- new HEAD;
- completed task;
- verification evidence;
- blocker/status;
- exact next task;
- any provider/configuration caveat future sessions must preserve.

## Safety / rollout constraints

- Work on `feat/checkout-mercadopago` unless the owner explicitly changes branch strategy.
- Never merge to `main` without explicit owner approval.
- Never write provider/Supabase secrets into docs, commits, logs, screenshots or chat.
- Preview/Sandbox acceptance comes before Production rollout.