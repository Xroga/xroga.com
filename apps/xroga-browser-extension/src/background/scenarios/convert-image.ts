// convert_image on real pictures in the real extension: a CC0 photograph (an elephant, 660×480 JPEG) and the flat W3C logo are resized, cropped, rounded, graded, converted, packed as several
// sizes and as a favicon set, and the logo is traced into SVG. Each result is fetched back and measured: its size, its alpha, its colour, the files in the ZIP.
import { normalizeImage } from '../../agent/image-spec';
import { ZipFile } from '../../agent/zip-read';
import { convertImageOnDevice } from '../../extension/compose';
import { defineScenario, outcome } from './registry';

const PHOTO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-images/elephant-660-480.jpg';
const LOGO = 'https://www.w3.org/Icons/w3c_home.png';

const make = async (args: Record<string, unknown>) => {
  const checked = normalizeImage(args);
  if (!checked.ok) throw new Error(checked.errors.join('; '));
  const made = await convertImageOnDevice(checked.request);
  const bytes = new Uint8Array(await (await fetch(made.url)).arrayBuffer());
  return { made, bytes, request: checked.request };
};
const decode = async (bytes: Uint8Array, type: string) => {
  const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const c = canvas.getContext('2d')!;
  c.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, data: c.getImageData(0, 0, bitmap.width, bitmap.height).data };
};
const alphaAt = (p: { width: number; data: Uint8ClampedArray }, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3]!;

defineScenario({
  id: 'S6-convert-image',
  set: 'C',
  title: 'real pictures resized, cropped, rounded, graded, converted, packed in several sizes and as a favicon set, and a logo traced into SVG',
  covers: 'convert_image: fit cover, round corners, grade bw, webp smaller than jpeg, sizes zip, favicon zip with .ico, svg trace',
  async run() {
    const original = await (await fetch(PHOTO)).arrayBuffer();
    const cover = await make({ url: PHOTO, format: 'png', width: 200, height: 200, fit: 'cover' });
    const coverPixels = await decode(cover.bytes, 'image/png');
    const round = await make({ url: PHOTO, format: 'png', width: 160, height: 160, round: 'circle' });
    const roundPixels = await decode(round.bytes, 'image/png');
    const bw = await make({ url: PHOTO, format: 'png', width: 120, grade: { preset: 'bw' } });
    const bwPixels = await decode(bw.bytes, 'image/png');
    let spread = 0;
    for (let i = 0; i < bwPixels.data.length; i += 4) spread += Math.abs(bwPixels.data[i]! - bwPixels.data[i + 1]!) + Math.abs(bwPixels.data[i + 1]! - bwPixels.data[i + 2]!);
    const webp = await make({ url: PHOTO, format: 'webp', quality: 70 });
    const jpeg = await make({ url: PHOTO, format: 'jpeg', quality: 70 });
    const crop = await make({ url: PHOTO, format: 'png', crop: { left: 100, top: 50, width: 300, height: 200 } });
    const cropPixels = await decode(crop.bytes, 'image/png');
    const padded = await make({ url: PHOTO, format: 'png', width: 100, padding: 10, background: '#ff0000' });
    const paddedPixels = await decode(padded.bytes, 'image/png');
    const sizes = await make({ url: PHOTO, format: 'webp', sizes: [64, 128, 256] });
    const sizesZip = new ZipFile(sizes.bytes);
    const fav = await make({ url: LOGO, favicons: true });
    const favZip = new ZipFile(fav.bytes);
    const ico = await favZip.bytes('favicon.ico');
    const svg = await make({ url: LOGO, format: 'svg', colors: 8 });
    const svgText = new TextDecoder().decode(svg.bytes);
    const thr = await make({ url: PHOTO, format: 'png', width: 120, threshold: 110 });
    const thrP = await decode(thr.bytes, 'image/png');
    let binary = 0;
    for (let i = 0; i < thrP.data.length; i += 4) if ((thrP.data[i] === 0 || thrP.data[i] === 255) && thrP.data[i] === thrP.data[i + 1]) binary++;
    const tinted = await make({ url: PHOTO, format: 'png', width: 120, tint: '#c86432' });
    const tintP = await decode(tinted.bytes, 'image/png');
    let warm = 0;
    for (let i = 0; i < tintP.data.length; i += 4) if (tintP.data[i]! >= tintP.data[i + 2]!) warm++;
    const plainSmall = await decode((await make({ url: PHOTO, format: 'png', width: 120 })).bytes, 'image/png');
    const gam = await decode((await make({ url: PHOTO, format: 'png', width: 120, gamma: 2 })).bytes, 'image/png');
    const meanOf = (p: { data: Uint8ClampedArray }) => { let t = 0; for (let i = 0; i < p.data.length; i += 4) t += p.data[i]! + p.data[i + 1]! + p.data[i + 2]!; return t / (p.data.length / 4) / 3; };
    const med = await make({ url: PHOTO, format: 'png', width: 120, median: 5 });
    const medP = await decode(med.bytes, 'image/png');
    const flat = await make({ url: LOGO, format: 'png', unflatten: true });
    const flatP = await decode(flat.bytes, 'image/png');
    const wm = await make({ url: PHOTO, format: 'png', width: 300, watermark: { url: LOGO, position: 'bottom-right', scale: 0.3, opacity: 1 } });
    const wmPlain = await make({ url: PHOTO, format: 'png', width: 300 });
    const wmP = await decode(wm.bytes, 'image/png');
    const plainP = await decode(wmPlain.bytes, 'image/png');
    let wmDiff = 0;
    for (let y = Math.floor(wmP.height * 0.7); y < wmP.height; y++) for (let x = Math.floor(wmP.width * 0.6); x < wmP.width; x++) wmDiff += Math.abs(wmP.data[(y * wmP.width + x) * 4]! - plainP.data[(y * wmP.width + x) * 4]!);

    const checks: Record<string, boolean> = {
      coverSize: coverPixels.width === 200 && coverPixels.height === 200,
      circleCorners: roundPixels.width === 160 && alphaAt(roundPixels, 1, 1) === 0 && alphaAt(roundPixels, 80, 80) === 255 && alphaAt(roundPixels, 158, 158) === 0,
      blackAndWhite: bwPixels.width === 120 && spread / (bwPixels.data.length / 4) < 3,
      webpSmaller: webp.bytes.length < jpeg.bytes.length && webp.bytes.length < original.byteLength,
      cropSize: cropPixels.width === 300 && cropPixels.height === 200,
      paddingRed: paddedPixels.width === 120 && paddedPixels.data[0] === 255 && paddedPixels.data[1] === 0 && paddedPixels.data[3] === 255,
      severalSizes: sizesZip.entries.length === 3 && ['-64.webp', '-128.webp', '-256.webp'].every(s => sizesZip.entries.some(e => e.name.endsWith(s))),
      faviconSet: favZip.has('favicon.ico') && favZip.has('apple-touch-icon.png') && favZip.has('android-chrome-512x512.png') && favZip.entries.length === 13 && !!ico && ico[2] === 1 && ico[4] === 3,
      svgTrace: svg.made.container === 'svg' && svgText.startsWith('<svg') && svgText.includes('<path') && svgText.length < 60000,
      watermark: wmDiff > 3000,
      threshold: binary === thrP.data.length / 4,
      tint: warm > (tintP.data.length / 4) * 0.97,
      gammaBrightens: meanOf(gam) > meanOf(plainSmall) + 15,
      medianSizes: medP.width === 120,
      unflatten: alphaAt(flatP, 0, 0) === 0 && flatP.data.some((v, i) => i % 4 === 3 && v === 255),
    };
    return outcome(
      'real pictures are resized, cropped, rounded, graded, converted, packed and traced, and each result measures as asked',
      JSON.stringify({
        failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
        sizes: { original: original.byteLength, webp: webp.bytes.length, jpeg: jpeg.bytes.length, cover: cover.bytes.length },
        zipEntries: favZip.entries.map(e => e.name),
        svgBytes: svgText.length,
        svgLayers: (svgText.match(/<path/g) ?? []).length,
        notes: svg.made.notes,
        wmDiff,
      }),
      Object.values(checks).every(Boolean),
    );
  },
});
