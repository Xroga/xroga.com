// A labelled grid laid over a picture, so a model that sees it can name a place ("B2") instead of guessing coordinates. The idea (probe frames with a 3x3 grid, A1 to C3, to ground a target) is
// from reading Panoptik (AGPL: concept only); the drawing is written fresh. Cell names: src/agent/compose-extras.ts.
import { cellName } from '@src/agent/compose-extras';

export function drawGrid(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, n = 3): void {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.setLineDash([4, 3]);
  for (let i = 1; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(x + (w * i) / n, y);
    ctx.lineTo(x + (w * i) / n, y + h);
    ctx.moveTo(x, y + (h * i) / n);
    ctx.lineTo(x + w, y + (h * i) / n);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const size = Math.max(10, Math.min(w, h) / (n * 4));
  ctx.font = `700 ${size}px sans-serif`;
  ctx.textBaseline = 'top';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const label = cellName(c, r);
      const lx = x + (w * c) / n + 3;
      const ly = y + (h * r) / n + 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(lx - 2, ly - 1, ctx.measureText(label).width + 4, size + 2);
      ctx.fillStyle = '#ffe14d';
      ctx.fillText(label, lx, ly);
    }
  }
  ctx.restore();
}
