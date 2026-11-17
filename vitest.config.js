import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom only where it's needed. Pure-logic and Electron-service tests run in
    // plain node, which is both faster and a real check that those modules don't
    // accidentally depend on browser globals.
    environment: 'node',
    environmentMatchGlobs: [['tests/components/**', 'jsdom']],
    setupFiles: ['tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    restoreMocks: true,
  },
});
