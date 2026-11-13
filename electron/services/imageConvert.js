import fs from 'fs/promises';
import { PNG } from 'pngjs';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { TIFFLoader } from 'three/examples/jsm/loaders/TIFFLoader.js';

// Decodes formats the browser can't preview natively (TGA, TIFF) and
// re-encodes them as PNG, so the renderer can show them through the same
// <img src="data:image/png;base64,..."> path it already uses for everything
// else. Reuses three's bundled DataTextureLoaders (already a dependency)
// for decoding — only their pure `.parse(arrayBuffer)` step, no WebGL
// involved — rather than hand-rolling TGA/TIFF parsing ourselves.
//
// Both loaders report `flipY: true` on their result, but this is three's
// blanket GL-texture-upload convention (applied when the pixels are later
// uploaded to the GPU), not a statement about the returned array's own row
// order — verified directly: `.data` is already top-down RGBA8, same as
// what PNG expects, so no row flip is needed here.
const LOADERS = {
  tga: () => new TGALoader(),
  tif: () => new TIFFLoader(),
  tiff: () => new TIFFLoader(),
};

export async function convertToPngPreview(filePath, ext) {
  const makeLoader = LOADERS[ext];
  if (!makeLoader) return { success: false, error: `No converter registered for .${ext}` };

  const buf = await fs.readFile(filePath);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const result = makeLoader().parse(arrayBuffer);
  if (!result || !result.width || !result.height || !result.data) {
    return { success: false, error: 'Decoded image had no pixel data' };
  }

  const png = new PNG({ width: result.width, height: result.height });
  png.data = Buffer.from(result.data.buffer, result.data.byteOffset, result.data.byteLength);

  const chunks = [];
  const base64 = await new Promise((resolve, reject) => {
    png.pack()
      .on('data', (d) => chunks.push(d))
      .on('end', () => resolve(Buffer.concat(chunks).toString('base64')))
      .on('error', reject);
  });

  return { success: true, data: base64, mime: 'image/png' };
}
