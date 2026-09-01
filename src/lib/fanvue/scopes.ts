/**
 * Streak asks for read-only scopes and nothing else. Each feature declares the
 * scope it needs so that a creator who grants less still gets a working app
 * with that one panel switched off, rather than an error page.
 *
 * Names match the Fanvue scopes reference. They must also match exactly what is
 * selected in the developer UI: an unrecognised scope fails at authorization
 * with invalid_scope, and a missing one fails per-request with 403.
 */
export const SCOPE_SELF = "read:self";
/**
 * Posts live under read:post. read:creator is a different, broader scope for
 * creator profiles and settings - it would not grant post access and would ask
 * for more than this app needs.
 */
export const SCOPE_POSTS = "read:post";
export const SCOPE_INSIGHTS = "read:insights";

export function hasScope(granted: string, scope: string): boolean {
  return granted.split(/\s+/).filter(Boolean).includes(scope);
}
