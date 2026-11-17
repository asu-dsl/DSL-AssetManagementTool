# Tests

```bash
npm test          # run once
npm run test:watch
npm test -- tests/components/P4Panel.test.jsx   # one file
```

[Vitest](https://vitest.dev) + [Testing Library](https://testing-library.com/docs/react-testing-library/intro/).
Config lives in `vitest.config.js` (separate from `vite.config.js`, which only builds the app).

## Layout

| Path | Environment | Covers |
| --- | --- | --- |
| `tests/shared/` | node | Pure logic shared by the renderer and the Electron main process |
| `tests/electron/` | node | Main-process services (`perforce.js` parsing, `zip.js`) |
| `tests/components/` | jsdom | React components, driven through the DOM as a user would |

Only `tests/components/**` gets a DOM, via `environmentMatchGlobs`. Everything else runs
in plain node, which is faster and doubles as a check that shared and main-process code
never quietly depends on a browser global.

## Conventions

- **Drive components through the DOM.** Query by role, label, or visible text and click
  with `userEvent` rather than reaching for internal state. The tests should survive a
  refactor that keeps the behavior.
- **The Electron bridge is mocked per test** by assigning `window.electron` in
  `beforeEach`. There is no global mock — each file declares exactly the handlers it needs,
  so an unexpected IPC call fails loudly instead of silently returning `undefined`.
- **jsdom leaves `window.confirm` unimplemented** (it returns `undefined`, which reads as
  "cancelled"). Any test touching a confirm-guarded path has to stub it.
- **`tests/electron/zipFixture.js` builds real zip bytes**, so `readZipEntry` is tested
  against genuine EOCD/central-directory/local-header structures rather than a mock.
- Comments explain *why* a case exists when it is pinning a specific past bug. Please keep
  that habit — several of these tests look arbitrary without the history.

## What is deliberately not covered

- `electron/main.js` IPC handler registration and app lifecycle — needs a running Electron
  process, not jsdom.
- The 3D viewer (`Model3D.jsx`, `AssetViewer.jsx`) — WebGL does not run under jsdom.
- Anything requiring a live Perforce server. The `p4` CLI is never actually invoked: the
  exported helpers under test are pure, and everything else goes through a mocked bridge.
