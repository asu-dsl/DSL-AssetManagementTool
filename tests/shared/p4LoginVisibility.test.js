import { describe, it, expect } from 'vitest';
import { shouldShowP4LoginModal } from '../../shared/p4LoginVisibility.js';

const state = (over = {}) => ({
  available: true, connected: false, loginRequested: false, dismissed: false, ...over,
});

describe('shouldShowP4LoginModal', () => {
  it('opens automatically when Perforce is available but not connected', () => {
    expect(shouldShowP4LoginModal(state())).toBe(true);
  });

  it('stays closed while the session is healthy', () => {
    expect(shouldShowP4LoginModal(state({ connected: true }))).toBe(false);
  });

  it('stays closed after the user dismisses it with "Not now"', () => {
    expect(shouldShowP4LoginModal(state({ dismissed: true }))).toBe(false);
  });

  it('never opens when the Perforce CLI is unavailable', () => {
    // Nothing may override this — the form cannot accomplish anything without p4.
    expect(shouldShowP4LoginModal(state({ available: false }))).toBe(false);
    expect(shouldShowP4LoginModal(state({ available: false, loginRequested: true }))).toBe(false);
    expect(shouldShowP4LoginModal(state({ available: false, connected: false, dismissed: false }))).toBe(false);
  });

  it('opens on an explicit request even after an earlier dismissal', () => {
    // Clicking "Log in" must work again after "Not now" — otherwise the button is
    // dead for the rest of the session.
    expect(shouldShowP4LoginModal(state({ dismissed: true, loginRequested: true }))).toBe(true);
  });

  // The regression this helper exists for. The session poll runs only every 45s, so
  // `connected` can still be true for up to 45 seconds after a ticket expires — which
  // is exactly when a submit fails with an auth error and the user clicks "Log in".
  // The previous rule ANDed in `!connected` and the button silently did nothing.
  it('opens on an explicit request even while `connected` is still a stale true', () => {
    expect(shouldShowP4LoginModal(state({ connected: true, loginRequested: true }))).toBe(true);
  });

  it('opens on request regardless of any other combination, given availability', () => {
    for (const connected of [true, false]) {
      for (const dismissed of [true, false]) {
        expect(
          shouldShowP4LoginModal({ available: true, connected, dismissed, loginRequested: true }),
        ).toBe(true);
      }
    }
  });
});
