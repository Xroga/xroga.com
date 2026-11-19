import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeImage, ImageDecodeError, scanColor } from '../pixels';

// A stand-in for the browser's ImageBitmap: like the real one, it reports 0×0 once it has been closed.
class FakeBitmap {
  #closed = false;
  constructor(private readonly w: number, private readonly h: number) {}
  get width() { return this.#closed ? 0 : this.w; }
  get height() { return this.#closed ? 0 : this.h; }
  close() { this.#closed = true; }
}

function install(w: number, h: number, pixel: [number, number, number]) {
  vi.stubGlobal('createImageBitmap', async () => new FakeBitmap(w, h));
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() {
      const { width, height } = this;
      return {
        drawImage() {},
        getImageData() {
          const data = new Uint8ClampedArray(width * height * 4);
          for (let i = 0; i < width * height; i++) data.set([...pixel, 255], i * 4);
          return { data };
        },
      };
    }
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('decodeImage', () => {
  it('keeps the true size after the bitmap is closed (the 0×0 bug) and finds the colour', async () => {
    install(160, 100, [255, 0, 0]);
    const picture = await decodeImage(btoa('png-bytes'));
    expect(picture.width).toBe(160);
    expect(picture.height).toBe(100);
    expect(scanColor(picture.data, picture.width, picture.height, { color: '#ff0000' })).toHaveLength(1);
  });

  it('throws a typed error when the context cannot decode, never an empty result', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    await expect(decodeImage(btoa('x'))).rejects.toMatchObject({ reason: 'no-offscreen-canvas' });
  });

  it('throws when the decoded image has no size, instead of passing a 0×0 page on as an observation', async () => {
    install(0, 0, [0, 0, 0]);
    await expect(decodeImage(btoa('x'))).rejects.toBeInstanceOf(ImageDecodeError);
    await expect(decodeImage(btoa('x'))).rejects.toMatchObject({ reason: 'empty-image' });
  });

  it('throws an invalid-image error for bytes the browser rejects', async () => {
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal('createImageBitmap', async () => { throw new Error('bad data'); });
    await expect(decodeImage(btoa('x'))).rejects.toMatchObject({ reason: 'invalid-image' });
  });
});
