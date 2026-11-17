import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { readZipEntry } from '../../electron/services/zip.js';
import { buildZip, randomBytes } from './zipFixture.js';

let dir;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-test-'));
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

let n = 0;
async function writeZip(buf) {
  const p = path.join(dir, `fixture-${n++}.zip`);
  await fs.writeFile(p, buf);
  return p;
}

const byName = (want) => (entries) => entries.find((e) => e.name === want);

describe('readZipEntry', () => {
  it('reads a deflated entry and returns its decompressed bytes', async () => {
    const p = await writeZip(buildZip([
      { name: 'meta.json', content: '{"name":"barrel"}' },
    ]));
    const r = await readZipEntry(p, byName('meta.json'));
    expect(r).not.toBeNull();
    expect(r.entry.name).toBe('meta.json');
    expect(r.data.toString('utf8')).toBe('{"name":"barrel"}');
  });

  it('reads a stored (uncompressed) entry', async () => {
    const p = await writeZip(buildZip([
      { name: 'raw.txt', content: 'no compression here', method: 0 },
    ]));
    const r = await readZipEntry(p, byName('raw.txt'));
    expect(r.data.toString('utf8')).toBe('no compression here');
  });

  it('picks the right entry out of many, with correct offset math', async () => {
    // The local-header offset arithmetic is the easiest thing to get wrong, and it
    // only shows up once an entry is not the first one in the file.
    const p = await writeZip(buildZip([
      { name: 'first.txt', content: 'AAA' },
      { name: 'second.txt', content: 'BBB', method: 0 },
      { name: 'third.txt', content: 'CCC' },
    ]));
    expect((await readZipEntry(p, byName('first.txt'))).data.toString()).toBe('AAA');
    expect((await readZipEntry(p, byName('second.txt'))).data.toString()).toBe('BBB');
    expect((await readZipEntry(p, byName('third.txt'))).data.toString()).toBe('CCC');
  });

  it('round-trips binary content without corruption', async () => {
    const blob = randomBytes(40000);
    const p = await writeZip(buildZip([{ name: 'tex.bin', content: blob }]));
    const r = await readZipEntry(p, byName('tex.bin'));
    expect(Buffer.compare(r.data, blob)).toBe(0);
  });

  it('hands the selector every entry so it can choose by any rule', async () => {
    const p = await writeZip(buildZip([
      { name: 'a/b/deep.png', content: 'img' },
      { name: 'notes.txt', content: 'text' },
    ]));
    const seen = [];
    const r = await readZipEntry(p, (entries) => {
      seen.push(...entries.map((e) => e.name));
      return entries.find((e) => e.name.endsWith('.png'));
    });
    expect(seen).toEqual(['a/b/deep.png', 'notes.txt']);
    expect(r.entry.name).toBe('a/b/deep.png');
  });

  it('preserves nested paths and unicode names', async () => {
    const p = await writeZip(buildZip([
      { name: 'textures/café/naïve.png', content: 'x' },
    ]));
    const r = await readZipEntry(p, (e) => e[0]);
    expect(r.entry.name).toBe('textures/café/naïve.png');
  });

  it('returns null when the selector picks nothing', async () => {
    const p = await writeZip(buildZip([{ name: 'a.txt', content: 'A' }]));
    expect(await readZipEntry(p, () => null)).toBeNull();
    expect(await readZipEntry(p, () => undefined)).toBeNull();
    expect(await readZipEntry(p, byName('missing.txt'))).toBeNull();
  });

  it('returns null for a compression method it cannot decode', async () => {
    // Method 12 (bzip2) is legal zip but unsupported here; it must refuse rather
    // than hand back the compressed bytes as if they were content.
    const p = await writeZip(buildZip([
      { name: 'odd.txt', content: 'payload', method: 12 },
    ]));
    expect(await readZipEntry(p, byName('odd.txt'))).toBeNull();
  });

  it('returns null for a file too small to hold an EOCD', async () => {
    const p = await writeZip(Buffer.from('tiny'));
    expect(await readZipEntry(p, (e) => e[0])).toBeNull();
  });

  it('returns null when there is no EOCD signature', async () => {
    const p = await writeZip(randomBytes(500));
    expect(await readZipEntry(p, (e) => e[0])).toBeNull();
  });

  it('returns null when the central directory is truncated or out of range', async () => {
    const good = buildZip([{ name: 'a.txt', content: 'A' }]);
    const bad = Buffer.from(good);
    // Point the EOCD's central-directory offset past the end of the file.
    bad.writeUInt32LE(0xfffff0, bad.length - 22 + 16);
    const p = await writeZip(bad);
    expect(await readZipEntry(p, (e) => e[0])).toBeNull();
  });

  it('finds the EOCD even when a trailing zip comment follows it', async () => {
    const p = await writeZip(buildZip(
      [{ name: 'a.txt', content: 'A' }],
      { comment: 'packaged by the asset tool' },
    ));
    const r = await readZipEntry(p, byName('a.txt'));
    expect(r.data.toString()).toBe('A');
  });

  it('propagates I/O errors instead of swallowing them', async () => {
    // Callers already wrap their ipcMain handlers, and a missing file is a bug
    // worth surfacing rather than reporting as "no matching entry".
    await expect(readZipEntry(path.join(dir, 'does-not-exist.zip'), (e) => e[0]))
      .rejects.toThrow();
  });

  it('does not leak file handles across many reads', async () => {
    // Would throw EMFILE if the finally-block close were missing.
    const p = await writeZip(buildZip([{ name: 'a.txt', content: 'A' }]));
    for (let i = 0; i < 400; i++) {
      await readZipEntry(p, byName('a.txt'));
    }
    expect((await readZipEntry(p, byName('a.txt'))).data.toString()).toBe('A');
  });
});
