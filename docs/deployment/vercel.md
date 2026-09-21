# Vercel production deployment

The production target for ProxyBembem is Vercel with the GitHub production branch set to `main`.

## Build

Vercel should use the framework preset **Next.js** and the repository root as the project root.

- Install command: automatic pnpm detection from `pnpm-lock.yaml`
- Build command: `pnpm build`
- Node.js: `22.x`
- Output directory: managed automatically by the Next.js integration


## Production environment

Configure the production environment with the real production values for all variables listed in `.env.example`.

The production deployment must use:

- `APP_ENVIRONMENT=production`
- `MERCADO_PAGO_ENVIRONMENT=production`
- `MELHOR_ENVIO_ENVIRONMENT=production`
- `NEXT_PUBLIC_SITE_URL=https://www.proxybembem.com.br`

Secrets must be configured only in Vercel Environment Variables and must never be committed.

## Notification scheduler

Transactional notification processing is scheduled by GitHub Actions, not Vercel Cron.

The workflow `.github/workflows/notification-cron.yml` calls:

`GET https://www.proxybembem.com.br/api/internal/notifications/process`

every five minutes and authenticates with:

`Authorization: Bearer <CRON_SECRET>`

Configure the same `CRON_SECRET` value in both places:

- Vercel Production Environment Variables, so the API route can validate requests;
- GitHub repository secret `CRON_SECRET` under **Settings -> Secrets and variables -> Actions**.

If the GitHub secret has not been configured yet, scheduled workflow runs exit without calling Production. An incorrect secret or an unhealthy endpoint makes the workflow fail visibly.

## Rate limiting

Vercel overwrites `x-forwarded-for` with the public client IP. When `VERCEL=1`, the server trusts exactly that one platform-managed hop. Local/non-Vercel execution trusts no forwarding hop.

## Domain and provider callbacks

After the first successful production deployment:

1. Attach `www.proxybembem.com.br` as the primary production domain.
2. Keep `proxybembem.com.br` redirected to `https://www.proxybembem.com.br`.
3. Confirm Mercado Pago webhook/return URLs use the canonical HTTPS domain.
4. Confirm Melhor Envio OAuth redirect URI uses the canonical HTTPS domain.
5. Confirm the Resend webhook remains pointed at `/api/webhooks/resend`.


## Transactional email delivery

The production Resend webhook is:

`https://www.proxybembem.com.br/api/webhooks/resend`

Subscribe only to the operational events used by the application: `email.sent`, `email.delivered`, `email.bounced`, `email.failed` and `email.suppressed`. Do not subscribe to `email.opened` or `email.clicked`. Open Tracking and Click Tracking remain OFF in Production.
