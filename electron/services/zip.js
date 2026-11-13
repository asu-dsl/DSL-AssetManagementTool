import fs from 'fs/promises';
import zlib from 'zlib';

// One deep reader for a zip's local entries. Walking the End-Of-Central-
// Directory record, the central directory, and the per-entry offset math is
// identical no matter which entry a caller actually wants — the only thing
// that varies is which entry to pick. `selectEntry` is that seam: it
// receives the full entry list ({name, method, compSize, localOffset}[])
// and returns the one to read, or a falsy value to read nothing.
//
// Returns { entry, data } (data is the decompressed Buffer) or null when
// nothing matched, the zip is too small/corrupt to have a readable EOCD, or
// the matched entry uses a compression method other than store (0) or
// deflate (8). I/O errors (bad path, permissions, etc.) propagate to the
// caller rather than being swallowed here, since every caller already
// wraps its ipcMain handler in a try/catch.
export async function readZipEntry(zipPath, selectEntry) {
  const fh = await fs.open(zipPath, 'r');
  try {
    const stat = await fh.stat();
    const size = stat.size;
    if (size < 22) return null;
    const tailLen = Math.min(size, 66560);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (!cdSize || cdOffset + cdSize > size) return null;
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const entries = [];
    let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const fnLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + fnLen);
      entries.push({ name, method, compSize, localOffset });
      p += 46 + fnLen + extraLen + commentLen;
    }

    const chosen = selectEntry(entries);
    if (!chosen) return null;

    const lh = Buffer.alloc(30);
    await fh.read(lh, 0, 30, chosen.localOffset);
    if (lh.readUInt32LE(0) !== 0x04034b50) return null;
    const lfnLen = lh.readUInt16LE(26);
    const lextraLen = lh.readUInt16LE(28);
    const dataStart = chosen.localOffset + 30 + lfnLen + lextraLen;
    const comp = Buffer.alloc(chosen.compSize);
    await fh.read(comp, 0, chosen.compSize, dataStart);

    let data;
    if (chosen.method === 0) data = comp;
    else if (chosen.method === 8) data = zlib.inflateRawSync(comp);
    else return null;

    return { entry: chosen, data };
  } finally {
    await fh.close();
  }
}
