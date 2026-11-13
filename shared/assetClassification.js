// One deep classification module for "what kind of file is this," imported
// by both the renderer (grid, viewer, thumbnails) and the Electron main
// process (folder-preview scanning). Previously this was reimplemented four
// times with four different extension lists, which let them drift apart —
// e.g. the grid classified .tga/.exr as images while the viewer didn't,
// so selecting one showed an image tile that opened to "no preview."
//
// `category` is deliberately broad (tga/exr still count as "image" for
// icons and the type filter) while `nativeMime`/`needsConversion` answer a
// narrower question: can this file's bytes actually be shown in an <img>
// tag, either directly or after main-process conversion? Keeping these
// separate is what lets the grid and the preview agree instead of each
// guessing independently.

const CATEGORY_EXTS = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tga', 'tif', 'tiff', 'exr'],
  model: ['obj', 'gltf', 'glb', 'fbx', 'dae', 'stl'],
  video: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
  audio: ['mp3', 'wav', 'ogg', 'flac'],
  material: ['mat'],
};

// Formats a browser can decode directly from raw bytes via a data: URI.
const NATIVE_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
};

// Formats with no native browser decoder, but that main.js's imageConvert
// service can decode and re-encode as PNG. EXR is deliberately excluded:
// it's linear HDR data that needs a tone-mapping decision before it can be
// shown as an 8-bit preview, which is a separate piece of work.
const CONVERTIBLE_EXTS = ['tga', 'tif', 'tiff'];

export function extOf(fileName) {
  return (String(fileName || '').split('.').pop() || '').toLowerCase();
}

export function classifyAsset(fileName) {
  const ext = extOf(fileName);
  let category = 'doc';
  for (const key of Object.keys(CATEGORY_EXTS)) {
    if (CATEGORY_EXTS[key].includes(ext)) { category = key; break; }
  }
  const nativeMime = NATIVE_MIME[ext] || null;
  const needsConversion = CONVERTIBLE_EXTS.includes(ext);
  return {
    ext,
    category,
    nativeMime,
    needsConversion,
    previewable: nativeMime !== null || needsConversion,
  };
}
