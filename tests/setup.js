import { expect, afterEach } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);

// Vitest's `restoreMocks` resets spies between tests, but mounted React trees
// are not Vitest's concern — without this, components from one test stay in the
// document and the next test's queries match the wrong element.
afterEach(() => {
  cleanup();
});
