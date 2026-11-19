// Independent check of an exported SVG against the A4 contract: one blue rectangle, one red circle, the text "Xroga", side by side, all inside 210 x 297 mm.
// Usage: node scripts/verify-a4-svg.mjs file.svg   (exit code 0 = pass)
import { readFileSync } from 'node:fs';

const svg = readFileSync(process.argv[2], 'utf8');
const problems = [];
const num = (s) => Number.parseFloat(s);
const root = /<svg[^>]*>/.exec(svg)?.[0] ?? '';
const w = num(/width="([\d.]+)mm"/.exec(root)?.[1]);
const h = num(/height="([\d.]+)mm"/.exec(root)?.[1]);
if (Math.abs(w - 210) > 0.5 || Math.abs(h - 297) > 0.5) problems.push(`page is ${w} x ${h} mm, not A4 210 x 297`);

/** Bounding box of an SVG path made of M/L/C/Z with absolute coordinates (TraceDraw's output). */
function bbox(d) {
  const n = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  const xs = [], ys = [];
  for (let i = 0; i + 1 < n.length; i += 2) { xs.push(n[i]); ys.push(n[i + 1]); }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
const paths = [...svg.matchAll(/<path\b[^>]*>/g)].map((m) => {
  const tag = m[0];
  return { fill: (/fill="(#[0-9a-fA-F]{6})"/.exec(tag)?.[1] ?? '').toLowerCase(), d: /\bd="([^"]+)"/.exec(tag)?.[1] ?? '' };
}).filter((p) => p.d);
const shapes = paths.map((p) => ({ ...p, ...bbox(p.d), curves: (p.d.match(/C/g) ?? []).length }));

const blue = shapes.filter((s) => s.fill === '#0000ff');
const red = shapes.filter((s) => s.fill === '#ff0000');
if (blue.length !== 1) problems.push(`expected exactly 1 blue shape, found ${blue.length}`);
if (red.length !== 1) problems.push(`expected exactly 1 red shape, found ${red.length}`);
const rect = blue[0], circle = red[0];
if (rect && rect.curves !== 0) problems.push('the blue shape is not a rectangle (it has curves)');
if (circle) {
  if (circle.curves < 4) problems.push('the red shape is not a circle (too few curves)');
  const cw = circle.x1 - circle.x0, ch = circle.y1 - circle.y0;
  if (Math.abs(cw - ch) > 0.5) problems.push(`the red shape is not round: ${cw.toFixed(1)} x ${ch.toFixed(1)} mm`);
}
const text = shapes.filter((s) => s !== rect && s !== circle && s.fill !== '');
if (!text.length) problems.push('no text outlines (Xroga) found');
const all = [rect, circle, ...text].filter(Boolean);
for (const s of all) {
  if (s.x0 < 0 || s.y0 < 0 || s.x1 > 210 || s.y1 > 297) problems.push(`a shape leaves the page: x ${s.x0.toFixed(1)}-${s.x1.toFixed(1)}, y ${s.y0.toFixed(1)}-${s.y1.toFixed(1)}`);
}
if (rect && circle && !(rect.x1 <= circle.x0)) problems.push('the rectangle and the circle are not side by side (rectangle must end left of the circle)');
if (rect && circle && (Math.abs((rect.y0 + rect.y1) / 2 - (circle.y0 + circle.y1) / 2) > 15)) problems.push('rectangle and circle are not on the same row');
if (text.length && rect && circle) {
  const tx = (text[0].x0 + text[0].x1) / 2, ty = (text[0].y0 + text[0].y1) / 2;
  const rowY = (rect.y0 + rect.y1) / 2;
  if (Math.abs(ty - rowY) < 1) problems.push('text is on the shapes row, expected below them');
  void tx;
}
console.log(JSON.stringify({ page: [w, h], rect: rect && [rect.x0, rect.y0, rect.x1, rect.y1].map((v) => +v.toFixed(1)), circle: circle && [circle.x0, circle.y0, circle.x1, circle.y1].map((v) => +v.toFixed(1)), textShapes: text.length, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
