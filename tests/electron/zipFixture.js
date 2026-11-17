import zlib from 'zlib';
import crypto from 'crypto';

// Builds a real .zip in memory so readZipEntry is exercised against genuine bytes
// (EOCD scan, central-directory walk, local-header offset math) rather than a mock.
// Supports store (0) and deflate (8), plus a method the reader must reject.

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * @param entries {{name: string, content: Buffer|string, method?: 0|8|number}[]}
 * @param opts {{comment?: string}}
 */
export function buildZip(entries, opts = {}) {
  const comment = Buffer.from(opts.comment || '', 'utf8');
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const raw = Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content, 'utf8');
    const method = e.method === undefined ? 8 : e.method;
    let comp;
    if (method === 0) comp = raw;
    else if (method === 8) comp = zlib.deflateRawSync(raw);
    else comp = raw; // an unsupported method the reader is expected to refuse
    const sum = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(sum, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(sum, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);

    locals.push(lh, name, comp);
    centrals.push(cd, name);
    offset += lh.length + name.length + comp.length;
  }

  const localPart = Buffer.concat(locals);
  const cdPart = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  eocd.writeUInt16LE(comment.length, 20);

  return Buffer.concat([localPart, cdPart, eocd, comment]);
}

export function randomBytes(n) {
  return crypto.randomBytes(n);
}
