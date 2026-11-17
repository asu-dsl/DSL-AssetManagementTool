import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srcDir = path.join(root, 'src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(srcDir);

const definedClasses = (() => {
  const css = files
    .filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  const set = new Set();
  for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) set.add(m[1]);
  return set;
})();

/**
 * Pulls literal class names out of a JSX file's className attributes, dropping
 * `${...}` interpolations. Only hyphenated tokens count, which is this codebase's
 * convention and keeps bare JS identifiers inside expressions out of the results.
 */
function usedClasses(src) {
  const used = new Set();
  for (const m of src.matchAll(/className\s*=\s*(?:"([^"]*)"|\{([^}]*)\})/g)) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    const cleaned = raw.replace(/\$\{[^}]*\}/g, ' ').replace(/[`'"]/g, ' ');
    for (const tok of cleaned.split(/[\s+?:(){}&|,]+/)) {
      const t = tok.trim();
      if (/^[a-z][\w-]*$/i.test(t) && t.includes('-')) used.add(t);
    }
  }
  return used;
}

// Styles are global in this bundle: a stylesheet imported by any component applies
// everywhere. That let LibraryNav render cc-* cards styled by CollectionsCard.css
// without importing it — and when CollectionsCard was deleted, every card in the
// library nav silently lost its styling. Nothing failed; it just looked broken.
describe('every class used in JSX is defined in some stylesheet', () => {
  const jsxFiles = files.filter((f) => f.endsWith('.jsx'));

  it('finds JSX files to check', () => {
    expect(jsxFiles.length).toBeGreaterThan(5);
  });

  it.each(jsxFiles.map((f) => [path.relative(root, f).replace(/\\/g, '/'), f]))(
    '%s', (_name, file) => {
      const missing = [...usedClasses(fs.readFileSync(file, 'utf8'))]
        .filter((c) => !definedClasses.has(c))
        .sort();
      expect(missing).toEqual([]);
    },
  );
});
