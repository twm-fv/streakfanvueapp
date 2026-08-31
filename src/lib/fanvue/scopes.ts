/**
 * Streak asks for read-only scopes and nothing else. Each feature declares the
 * scope it needs so that a creator who grants less still gets a working app
 * with that one panel switched off, rather than an error page.
 *
 * Scope names must match exactly what is selected in the Fanvue developer UI.
 * Override via OAUTH_SCOPES if the platform renames one.
 */
export const SCOPE_SELF = "read:self";
export const SCOPE_CREATOR = "read:creator";
export const SCOPE_INSIGHTS = "read:insights";

export function hasScope(granted: string, scope: string): boolean {
  return granted.split(/\s+/).filter(Boolean).includes(scope);
}
