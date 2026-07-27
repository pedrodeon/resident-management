export type AccessDecision = "allow" | "redirect-login" | "redirect-no-access";

/**
 * Where a request should route, given whether the caller is authenticated and
 * whether they have a staff record in `public.users`.
 *
 * Pure and dependency-free so the redirect rules are unit-testable and cannot
 * silently regress. The bug this guards against: treating "authenticated but
 * no staff row" the same as "not authenticated" sends the user to /login —
 * which sends authenticated users back to / — an infinite redirect loop. Those
 * two states MUST resolve differently, so a staff member whose account was
 * removed (or never set up) lands somewhere terminal instead of looping.
 */
export function accessDecision(input: {
  authenticated: boolean;
  hasStaffRecord: boolean;
}): AccessDecision {
  if (!input.authenticated) return "redirect-login";
  if (!input.hasStaffRecord) return "redirect-no-access";
  return "allow";
}
