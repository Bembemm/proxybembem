# Supabase Auth Security Evidence

Date: 2026-09-16

Project: `ProxyBembem` (`kicgoocozxzkuoqajqif`)
Plan: Supabase Free

This document records repository-enforced Auth controls, live Security Advisor review, and the remaining owner-dashboard actions. It deliberately distinguishes verified application/database state from settings that the available Supabase connector cannot read or mutate.

## Password policy

Repository policy for **new passwords** is now:

- 8 to 128 characters;
- at least one lowercase letter;
- at least one uppercase letter;
- at least one digit;
- at least one symbol from Supabase's documented strong-password symbol set.

The shared policy lives in `lib/auth/password-policy.ts` and is used by both client form validation and server-authoritative account mutation parsing. Signup, signed-in password changes, and recovery password changes use the strong policy.

Login intentionally remains length-bounded rather than applying the new complexity rule at the application parser. This avoids an application-side lockout for an existing credential created before the stronger policy. Supabase may still return its own weak-password signal according to the effective Auth project configuration.

Password-policy errors are safe to show because they describe only the submitted password requirements and disclose nothing about whether an email/account exists.

Current Supabase guidance recommends a minimum of at least 8 characters and the strongest required-character option: digits, lowercase and uppercase letters, and symbols.

Reference: https://supabase.com/docs/guides/auth/password-security

## Supabase Auth dashboard target

The repository is ready for these free Auth settings:

| Setting | Target | Verification status |
| --- | --- | --- |
| Minimum password length | `8` | OWNER DASHBOARD VERIFICATION REQUIRED |
| Required characters | lowercase + uppercase + digits + symbols | OWNER DASHBOARD VERIFICATION REQUIRED |
| Email confirmation | enabled | OWNER DASHBOARD VERIFICATION REQUIRED |
| Leaked Password Protection | OFF | ACCEPTED — project is Free; feature is Pro+ |
| CAPTCHA / Turnstile | not enabled in this change | EXTERNAL CREDENTIAL + FRONTEND TOKEN PREREQUISITE |
| Password-change reauthentication/current-password requirement | unchanged | DO NOT ENABLE until the account UI implements the required nonce/current-password flow |

The connector available for this work exposes project/database/advisor operations but does not expose hosted Auth configuration mutation or a reliable read of these dashboard toggles. Therefore this document does **not** claim the three owner-dashboard settings above are already enabled.

Supabase recommends email confirmations for production and exposes password strength under Auth settings. CAPTCHA requires a provider secret plus a frontend challenge token, so enabling the dashboard toggle alone would break the current forms.

References:

- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/guides/deployment/going-into-prod

## Application-level Auth abuse controls

Current application rate-limit policies remain independent and server-side:

| Scope | Limit | Window |
| --- | ---: | ---: |
| signup | 5 | 15 min |
| login | 10 | 10 min |
| password reset request | 5 | 15 min |
| password recovery mutation | 5 | 15 min |
| account profile/password mutation | 20 | 10 min |

These limits are additional to Supabase Auth's own platform rate limits. The Supabase dashboard rate-limit values were not changed blindly; they should remain at effective defaults or stricter values only after the owner verifies that email/signup/recovery flows remain usable.

Reference: https://supabase.com/docs/guides/deployment/going-into-prod#auth-rate-limits

## Email confirmation flow in the application

The application already implements a confirmation-first signup flow:

1. signup submits to Supabase with `emailRedirectTo`;
2. the confirmation callback accepts/validates a token hash;
3. the customer is redirected to login after confirmation;
4. protected customer flows require an authenticated, confirmed user.

This application behavior supports enabling Supabase email confirmation, but the hosted project toggle itself still requires owner-dashboard verification as noted above.

## Admin authentication

Existing administrative authorization remains unchanged:

- immutable configured owner UUID;
- Supabase password identity;
- TOTP MFA / `aal2` requirement for protected administration;
- active server-side administrative session;
- private/no-store admin responses.

This hardening does not weaken or replace the existing admin MFA boundary.

## Security Advisor review — 2026-09-16

The live Security Advisor was re-run during this hardening review.

### `auth_leaked_password_protection` — WARN

Status: **accepted known warning**.

Leaked Password Protection is disabled. The project is on the Free plan and Supabase documents this feature as Pro+.

Remediation reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

### `rls_enabled_no_policy` — INFO (16 tables)

Tables reported:

- `admin_audit_log`
- `admin_sessions`
- `api_rate_limits`
- `melhor_envio_oauth_credentials`
- `melhor_envio_oauth_states`
- `notification_outbox`
- `notification_webhook_events`
- `order_attention_flags`
- `order_events`
- `orders`
- `password_recovery_grants`
- `products`
- `shipment_events`
- `shipments`
- `shipping_sender_profiles`
- `store_settings`

Live privilege inspection verified that neither `anon` nor `authenticated` has direct DML privileges on these tables. Their lack of browser policies is therefore consistent with the current server-only/deny-by-default architecture. No permissive `USING (true)`/blanket authenticated policy was added merely to clear the Advisor.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

### `authenticated_security_definer_function_executable` — WARN (2 RPCs)

Functions:

- `public.customer_get_order(p_order_id uuid)`
- `public.customer_list_orders(p_limit integer, p_offset integer)`

Live definition/grant inspection verified:

- both are intentionally callable by `authenticated`;
- neither is executable by `anon`;
- both use `SECURITY DEFINER` with fixed `search_path = ''`;
- both derive the customer identity from `auth.uid()`;
- `customer_get_order` restricts the selected order with `o.customer_id = auth.uid()` equivalent state;
- `customer_list_orders` counts/lists only rows where `o.customer_id` equals that authenticated identity;
- pagination inputs are bounded in `customer_list_orders`.

The warning is therefore classified as an intentional authenticated customer API surface, not an authorization defect discovered by this review. Any future change to these RPC bodies/grants must preserve owner scoping and should re-run the Advisor.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Decisions not taken

- No RLS policy was broadened to silence informational findings.
- No SQL migration was introduced because the reviewed Advisor findings did not reveal an ownership defect.
- Leaked-password protection was not treated as a blocker because it requires a paid plan.
- CAPTCHA was not enabled without provider credentials and frontend token integration.
- Reauthentication/current-password enforcement was not toggled without corresponding UI/server support.

## Remaining owner-dashboard checklist

Before production promotion of this hardening candidate, verify in Supabase Dashboard:

- [ ] Minimum password length is `8`.
- [ ] Required characters use the strongest option: lowercase + uppercase + digits + symbols.
- [ ] Email confirmation is enabled.
- [ ] Leaked Password Protection remains OFF unless the project is upgraded and the owner chooses to enable it.
- [ ] Auth rate limits are reviewed and compatible with current signup/recovery traffic.
- [ ] CAPTCHA remains OFF unless provider credentials and frontend challenge-token support are implemented and tested.

These unchecked items are configuration evidence still required outside the repository; they are not represented as completed by this document.
