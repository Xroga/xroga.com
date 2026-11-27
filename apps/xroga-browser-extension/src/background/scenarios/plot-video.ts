// A plot layer on a real render: a sine curve and a bar chart draw themselves in. Frames at two moments are compared by their colour: the curve colour appears, and more of it is there later.
import { previewOnDevice } from '../../extension/compose';
import { defineScenario, outcome } from './registry';

const pixels = async (base64: string) => {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height - 18);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, -18);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
};
/** How many pixels are close to a colour. */
const near = (px: Uint8ClampedArray, c: [number, number, number], tol = 60) => {
  let n = 0;
  for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i]! - c[0]) < tol && Math.abs(px[i + 1]! - c[1]) < tol && Math.abs(px[i + 2]! - c[2]) < tol) n++;
  return n;
};

const clip = (layer: object) => ({ width: 640, height: 360, fps: 15, clips: [{ duration: 4, layers: [{ type: 'fill-color', color: '#101820' }, layer] }] });

defineScenario({
  id: 'S6-plot-video',
  set: 'C',
  title: 'a function plot and a bar chart that draw themselves in on a real render',
  covers: 'compose_video plot layer: axes, ticks, a curve from a formula that comes in over drawIn seconds, bars that grow',
  async run() {
    const curve = clip({ type: 'plot', kind: 'function', expr: 'sin(x)', xRange: [-6.3, 6.3], color: '#f97316', title: 'sin(x)', drawIn: 2 });
    const early = await pixels((await previewOnDevice(curve, [0.4])).base64);
    const late = await pixels((await previewOnDevice(curve, [3])).base64);
    const bars = clip({ type: 'plot', kind: 'bar', values: [12, 30, 22, 40], labels: ['Q1', 'Q2', 'Q3', 'Q4'], colors: ['#38bdf8', '#38bdf8', '#38bdf8', '#38bdf8'], drawIn: 1.5 });
    const barsEarly = await pixels((await previewOnDevice(bars, [0.02])).base64);
    const barsLate = await pixels((await previewOnDevice(bars, [3])).base64);
    const orangeEarly = near(early, [249, 115, 22]);
    const orangeLate = near(late, [249, 115, 22]);
    const blueEarly = near(barsEarly, [56, 189, 248]);
    const blueLate = near(barsLate, [56, 189, 248]);
    const checks: Record<string, boolean> = {
      curveAppears: orangeLate > 300,
      curveDrawsIn: orangeLate > orangeEarly * 1.6,
      barsGrow: blueLate > blueEarly * 3 && blueLate > 3000,
    };
    return outcome(
      'the curve and the bars draw themselves in',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), orange: [orangeEarly, orangeLate], blue: [blueEarly, blueLate] }),
      Object.values(checks).every(Boolean),
    );
  },
});
