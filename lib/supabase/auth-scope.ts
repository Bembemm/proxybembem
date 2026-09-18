export const CUSTOMER_AUTH_COOKIE_NAME = "pb-customer-auth"
export const ADMIN_AUTH_COOKIE_NAME = "pb-admin-auth"

export type SupabaseAuthScope = "customer" | "admin"

export function authCookieName(scope: SupabaseAuthScope) {
  return scope === "admin" ? ADMIN_AUTH_COOKIE_NAME : CUSTOMER_AUTH_COOKIE_NAME
}
