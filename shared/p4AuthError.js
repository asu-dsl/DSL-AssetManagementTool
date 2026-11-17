/**
 * True when a Perforce error message means "your session isn't valid" — as opposed to a
 * workspace, file, or validation problem. Used to decide whether to offer a login affordance.
 *
 * Deliberately broader than the backend's own checks: this only decides whether to show a
 * "Log in" button, so a false positive costs an unnecessary button, not a failed operation.
 * Kept in sync by hand with the patterns in electron/services/perforce.js
 * (checkSession, classifyLoginError).
 */
export function isP4AuthError(message) {
  if (!message) return false;
  return /session has expired|please login again|not logged in|password invalid|p4passwd|invalid or unset|authentication failed|perforce password/i
    .test(String(message));
}
