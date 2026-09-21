# Vercel production deployment

The production target for ProxyBembem is Vercel with the GitHub production branch set to `main`.

## Build

Vercel should use the framework preset **Next.js** and the repository root as the project root.

- Install command: automatic pnpm detection from `pnpm-lock.yaml`
- Build command: `pnpm build`
- Node.js: `22.x`
- Output directory: managed automatically by the Next.js integration

Do not use the legacy KingHost standalone build or `app.js` startup adapter for Vercel.

## Production environment

Configure the production environment with the real production values for all variables listed in `.env.example`.

The production deployment must use:

- `APP_ENVIRONMENT=production`
- `MERCADO_PAGO_ENVIRONMENT=production`
- `MELHOR_ENVIO_ENVIRONMENT=production`
- `NEXT_PUBLIC_SITE_URL=https://www.proxybembem.com.br`

Secrets must be configured only in Vercel Environment Variables and must never be committed.

## Cron

`vercel.json` schedules:

`GET /api/internal/notifications/process`

every five minutes.

Configure `CRON_SECRET` in Vercel Production. Vercel sends it as `Authorization: Bearer <CRON_SECRET>`, which is already accepted by the route.

## Rate limiting

Vercel overwrites `x-forwarded-for` with the public client IP. When `VERCEL=1`, the server automatically trusts exactly one proxy hop. Outside Vercel, `RATE_LIMIT_TRUSTED_PROXY_HOPS` remains fail-closed by default.

## Domain and provider callbacks

After the first successful production deployment:

1. Attach `www.proxybembem.com.br` as the primary production domain.
2. Keep `proxybembem.com.br` redirected to `https://www.proxybembem.com.br`.
3. Confirm Mercado Pago webhook/return URLs use the canonical HTTPS domain.
4. Confirm Melhor Envio OAuth redirect URI uses the canonical HTTPS domain.
5. Confirm the Resend webhook remains pointed at `/api/webhooks/resend`.

The legacy KingHost deployment files can remain temporarily for rollback/history, but they are not part of the Vercel production path.
