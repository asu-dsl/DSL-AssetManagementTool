/**
 * Decides whether the Perforce login form should be on screen.
 *
 * Extracted from App.jsx so the rule can be tested directly — it is subtler than it
 * looks, and got this wrong once already:
 *
 * - `available` is a hard gate. With no Perforce CLI installed the form can do nothing,
 *   so nothing may force it open.
 * - `loginRequested` (the user clicked a "Log in" affordance) deliberately ignores
 *   `connected`. The background session poll only runs every 45s, so `connected` can
 *   still be a stale `true` in the window right after a ticket expires — which is
 *   exactly when an operation fails with an auth error and the user clicks Log in.
 *   Gating on `!connected` there made the button silently do nothing.
 * - `dismissed` ("Not now") only suppresses the *automatic* appearance on a detected
 *   disconnect. It must never block an explicit request.
 */
export function shouldShowP4LoginModal({ available, connected, loginRequested, dismissed }) {
  if (!available) return false;
  if (loginRequested) return true;
  return !connected && !dismissed;
}
