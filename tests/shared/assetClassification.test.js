import { describe, it, expect } from 'vitest';
import { classifyAsset, extOf } from '../../shared/assetClassification.js';

describe('extOf', () => {
  it('lowercases the extension', () => {
    expect(extOf('Texture.PNG')).toBe('png');
    expect(extOf('Model.FBX')).toBe('fbx');
  });

  it('takes the last segment of a multi-dot name', () => {
    expect(extOf('character.diffuse.tga')).toBe('tga');
    expect(extOf('v1.2.3.glb')).toBe('glb');
  });

  it('handles a full path, not just a bare name', () => {
    expect(extOf('C:/art/props/barrel.obj')).toBe('obj');
    expect(extOf('//depot/art/barrel.obj')).toBe('obj');
  });

  it('returns empty string for nullish input rather than throwing', () => {
    expect(extOf(undefined)).toBe('');
    expect(extOf(null)).toBe('');
    expect(extOf('')).toBe('');
  });

  // Documents real current behavior: with no dot, `split('.').pop()` returns the
  // whole name. Callers only ever compare the result against known extension
  // lists, so an extension-less file lands in the 'doc' category either way.
  it('returns the whole name when there is no dot', () => {
    expect(extOf('README')).toBe('readme');
  });
});

describe('classifyAsset categories', () => {
  it.each([
    ['shot.jpg', 'image'], ['shot.jpeg', 'image'], ['shot.png', 'image'],
    ['shot.gif', 'image'], ['shot.bmp', 'image'], ['shot.webp', 'image'],
    ['shot.tif', 'image'], ['shot.tiff', 'image'],
    ['prop.obj', 'model'], ['prop.gltf', 'model'], ['prop.glb', 'model'],
    ['prop.fbx', 'model'], ['prop.dae', 'model'], ['prop.stl', 'model'],
    ['clip.mp4', 'video'], ['clip.mov', 'video'], ['clip.avi', 'video'],
    ['clip.mkv', 'video'], ['clip.webm', 'video'],
    ['sfx.mp3', 'audio'], ['sfx.wav', 'audio'], ['sfx.ogg', 'audio'], ['sfx.flac', 'audio'],
    ['surface.mat', 'material'],
  ])('classifies %s as %s', (name, category) => {
    expect(classifyAsset(name).category).toBe(category);
  });

  it('falls back to doc for unknown extensions', () => {
    expect(classifyAsset('notes.txt').category).toBe('doc');
    expect(classifyAsset('sheet.xlsx').category).toBe('doc');
    expect(classifyAsset('LICENSE').category).toBe('doc');
  });
});

// The regression this module was created to prevent: the grid and the viewer each
// kept their own extension list, so .tga/.exr showed an image tile that opened to
// "no preview." Category and previewability are now answered by one module, and
// these assertions pin the distinction between them.
describe('classifyAsset previewability', () => {
  it('marks natively-decodable formats with a mime type and no conversion', () => {
    expect(classifyAsset('shot.png')).toMatchObject({
      category: 'image', nativeMime: 'image/png', needsConversion: false, previewable: true,
    });
    expect(classifyAsset('shot.jpg').nativeMime).toBe('image/jpeg');
    expect(classifyAsset('shot.jpeg').nativeMime).toBe('image/jpeg');
  });

  it('marks tga/tif/tiff as images that are previewable only after conversion', () => {
    for (const name of ['shot.tga', 'shot.tif', 'shot.tiff']) {
      expect(classifyAsset(name)).toMatchObject({
        category: 'image', nativeMime: null, needsConversion: true, previewable: true,
      });
    }
  });

  it('counts exr as an image but deliberately not previewable', () => {
    // EXR is linear HDR data needing a tone-mapping decision before it can be shown
    // as 8-bit, so it is excluded from conversion on purpose.
    expect(classifyAsset('plate.exr')).toMatchObject({
      category: 'image', nativeMime: null, needsConversion: false, previewable: false,
    });
  });

  it('never marks non-images previewable', () => {
    for (const name of ['prop.fbx', 'clip.mp4', 'sfx.wav', 'notes.txt', 'surface.mat']) {
      const r = classifyAsset(name);
      expect(r.previewable).toBe(false);
      expect(r.nativeMime).toBeNull();
      expect(r.needsConversion).toBe(false);
    }
  });

  it('agrees between category and previewable for every convertible format', () => {
    // The exact pairing the four drifting copies used to get wrong.
    for (const name of ['a.tga', 'a.tif', 'a.tiff', 'a.png', 'a.jpg']) {
      const r = classifyAsset(name);
      expect(r.category).toBe('image');
      expect(r.previewable).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(classifyAsset('SHOT.PNG')).toMatchObject({ category: 'image', previewable: true });
    expect(classifyAsset('PROP.FBX').category).toBe('model');
  });
});
