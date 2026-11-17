import { describe, it, expect } from 'vitest';
import { isP4AuthError } from '../../shared/p4AuthError.js';

// This predicate decides whether the Perforce panel offers a "Log in" button on an
// error banner. A false negative strands the user with no way to recover; a false
// positive puts a login button on an unrelated failure.
describe('isP4AuthError', () => {
  it.each([
    ['Perforce password (P4PASSWD) invalid or unset.'],
    ['Your session has expired, please login again.'],
    ["User bob doesn't exist. Password invalid."],
    ['Password invalid.'],
    ["Access for user 'jlin' has not been enabled by 'p4 protect'. Not logged in."],
    ['authentication failed'],
    ['Perforce password (P4PASSWD) invalid or unset.\nSubmit aborted.'],
  ])('treats %j as an auth failure', (msg) => {
    expect(isP4AuthError(msg)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isP4AuthError('PERFORCE PASSWORD (P4PASSWD) INVALID OR UNSET.')).toBe(true);
    expect(isP4AuthError('session HAS Expired')).toBe(true);
  });

  it.each([
    // The panel's own validation messages — these must never grow a login button.
    ['Please enter a description'],
    ['No files opened for submit'],
    ['No files selected'],
    ['Failed to get diff'],
    ['Submit failed'],
    // Real Perforce errors that are not about authentication.
    ["Path '//depot/art/...' is not under client's root c:\work."],
    ["Merges still pending -- use 'resolve' to merge files."],
    ['File(s) up-to-date.'],
    ['no such file(s).'],
    ["Client 'art-ws' unknown - use 'client' command to create it."],
  ])('does not treat %j as an auth failure', (msg) => {
    expect(isP4AuthError(msg)).toBe(false);
  });

  it('returns false for empty and nullish input instead of throwing', () => {
    expect(isP4AuthError(undefined)).toBe(false);
    expect(isP4AuthError(null)).toBe(false);
    expect(isP4AuthError('')).toBe(false);
  });

  it('accepts a non-string without throwing', () => {
    // Error objects and the like reach this from catch blocks.
    expect(isP4AuthError(new Error('Password invalid.'))).toBe(true);
    expect(isP4AuthError(1234)).toBe(false);
  });
});
