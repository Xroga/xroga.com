// Drawing a plot layer (src/agent/plot.ts) on the canvas: grid and axes with tick labels, then the curve, the line or the bars coming in over `drawIn` seconds.
import { autoYRange, parseExpression, sampleFunction, ticks, type PlotSpec } from '@src/agent/plot';

const PALETTE = ['#38bdf8', '#f97316', '#a3e635', '#e879f9', '#facc15', '#fb7185'];
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const fmt = (v: number): string => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(0) : String(Math.round(v * 1e6) / 1e6));

export function drawPlot(ctx: OffscreenCanvasRenderingContext2D, plot: PlotSpec, box: { x: number; y: number; w: number; h: number }, seconds: number): void {
  const unit = Math.min(box.w, box.h);
  const left = Math.max(unit * 0.12, 50);
  const right = unit * 0.04;
  const top = plot.title ? unit * 0.14 : unit * 0.06;
  const bottom = Math.max(unit * 0.14, 40);
  const px = box.x + left;
  const py = box.y + top;
  const pw = Math.max(10, box.w - left - right);
  const ph = Math.max(10, box.h - top - bottom);
  const progress = plot.drawIn <= 0 ? 1 : ease(seconds / plot.drawIn);

  // data and ranges
  let yRange = plot.yRange;
  let curves: Array<Array<{ x: number; y: number } | null>> = [];
  let bars: number[] = [];
  const fs = Math.max(11, Math.round(unit * 0.032));
  if (plot.kind === 'function') {
    const fns = plot.expr!.split(';').filter(s => s.trim()).map(parseExpression);
    yRange ??= fns.map(f => autoYRange(f, plot.xRange)).reduce((a, b) => [Math.min(a[0], b[0]), Math.max(a[1], b[1])] as [number, number]);
    curves = fns.map(f => sampleFunction(f, plot.xRange, yRange!));
  } else if (plot.kind === 'line') {
    const pts = plot.values!.map((v, i) => (Array.isArray(v) ? { x: v[0], y: v[1] } : { x: i, y: v }));
    const ys = pts.map(p => p.y);
    yRange ??= [Math.min(0, ...ys), Math.max(...ys) * 1.1 || 1];
    const xs = pts.map(p => p.x);
    const xr: [number, number] = plot.xRange[1] > plot.xRange[0] && plot.xRange[0] !== -5 ? plot.xRange : [Math.min(...xs), Math.max(...xs) === Math.min(...xs) ? Math.min(...xs) + 1 : Math.max(...xs)];
    plot = { ...plot, xRange: xr };
    curves = [pts];
  } else {
    bars = plot.values!.map(v => (Array.isArray(v) ? v[1] : v));
    yRange ??= [Math.min(0, ...bars), Math.max(...bars) * 1.1 || 1];
  }
  const [y0, y1] = yRange!;
  const [x0, x1] = plot.kind === 'bar' ? [0, bars.length] : plot.xRange;
  const sx = (x: number) => px + ((x - x0) / (x1 - x0)) * pw;
  const sy = (y: number) => py + ph - ((y - y0) / (y1 - y0)) * ph;

  ctx.save();
  ctx.font = `${fs}px sans-serif`;
  // grid and tick labels
  const xt = plot.kind === 'bar' ? [] : ticks(x0, x1, Math.max(3, Math.round(pw / (unit * 0.18))));
  const yt = ticks(y0, y1, Math.max(3, Math.round(ph / (unit * 0.12))));
  ctx.lineWidth = 1;
  for (const t of xt) {
    if (plot.grid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.moveTo(sx(t), py);
      ctx.lineTo(sx(t), py + ph);
      ctx.stroke();
    }
    ctx.fillStyle = plot.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(t), sx(t), py + ph + fs * 0.5);
  }
  for (const t of yt) {
    if (plot.grid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.moveTo(px, sy(t));
      ctx.lineTo(px + pw, sy(t));
      ctx.stroke();
    }
    ctx.fillStyle = plot.textColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(t), px - fs * 0.6, sy(t));
  }
  // axes: through zero where it is in the picture, else along the edge
  ctx.strokeStyle = plot.textColor;
  ctx.lineWidth = Math.max(1.5, unit * 0.004);
  const axisY = y0 <= 0 && y1 >= 0 ? sy(0) : py + ph;
  const axisX = x0 <= 0 && x1 >= 0 && plot.kind !== 'bar' ? sx(0) : px;
  ctx.beginPath();
  ctx.moveTo(px, axisY);
  ctx.lineTo(px + pw, axisY);
  ctx.moveTo(axisX, py);
  ctx.lineTo(axisX, py + ph);
  ctx.stroke();
  if (plot.title) {
    ctx.fillStyle = plot.textColor;
    ctx.font = `700 ${Math.round(fs * 1.3)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(plot.title, box.x + box.w / 2, box.y + unit * 0.02);
    ctx.font = `${fs}px sans-serif`;
  }
  if (plot.xLabel) {
    ctx.fillStyle = plot.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(plot.xLabel, px + pw / 2, box.y + box.h - 2);
  }
  if (plot.yLabel) {
    ctx.save();
    ctx.translate(box.x + fs, py + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = plot.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(plot.yLabel, 0, 0);
    ctx.restore();
  }

  // the data, inside the plot area, coming in from the left (or growing, for bars)
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  const colorOf = (i: number) => plot.colors?.[i] ?? (i === 0 ? plot.color : PALETTE[i % PALETTE.length]!);
  if (plot.kind === 'bar') {
    const n = bars.length;
    const slot = pw / Math.max(1, n);
    bars.forEach((v, i) => {
      // each bar starts a little after the one before it
      const local = ease((progress * (1 + 0.5) - (i / Math.max(1, n)) * 0.5) / 1);
      const h = (sy(0 > y0 ? 0 : y0) - sy(v)) * Math.min(1, Math.max(0, local));
      ctx.fillStyle = colorOf(plot.colors ? i : 0);
      const bx = px + i * slot + slot * 0.15;
      ctx.fillRect(bx, sy(0 > y0 ? 0 : y0) - h, slot * 0.7, h);
    });
  } else {
    ctx.lineWidth = Math.max(2, unit * 0.007);
    ctx.lineJoin = 'round';
    curves.forEach((pts, ci) => {
      ctx.strokeStyle = colorOf(ci);
      ctx.fillStyle = colorOf(ci);
      const limit = x0 + (x1 - x0) * progress;
      let tip: { x: number; y: number } | null = null;
      let pen = false;
      ctx.beginPath();
      for (const p of pts) {
        if (!p || p.x > limit + 1e-9) {
          pen = false;
          if (p && p.x > limit) break;
          continue;
        }
        if (pen) ctx.lineTo(sx(p.x), sy(p.y));
        else ctx.moveTo(sx(p.x), sy(p.y));
        pen = true;
        tip = p;
      }
      ctx.stroke();
      if (tip && progress < 1) {
        ctx.beginPath();
        ctx.arc(sx(tip.x), sy(tip.y), Math.max(3, unit * 0.012), 0, Math.PI * 2);
        ctx.fill();
      }
      if (plot.kind === 'line') {
        for (const p of pts) {
          if (!p || p.x > limit + 1e-9) continue;
          ctx.beginPath();
          ctx.arc(sx(p.x), sy(p.y), Math.max(2.5, unit * 0.009), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }
  ctx.restore();
  // bar names sit under the axis, outside the clipped plot area
  if (plot.kind === 'bar' && plot.labels) {
    const slot = pw / Math.max(1, bars.length);
    ctx.fillStyle = plot.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    plot.labels.slice(0, bars.length).forEach((label, i) => ctx.fillText(label.slice(0, 14), px + (i + 0.5) * slot, py + ph + fs * 0.5));
  }
  ctx.restore();
}
