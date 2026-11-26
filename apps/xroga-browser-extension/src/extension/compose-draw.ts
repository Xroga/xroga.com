// Drawing one moment of a composed video onto a canvas (see src/agent/compose-spec.ts for the description and the timeline). Browser-only: it needs a 2D canvas.
import { ease, layerActive, layoutAt, type ComposeSpec, type Layer, type ResizeMode } from '@src/agent/compose-spec';

export type Picture = CanvasImageSource & { width: number; height: number };
export interface Assets {
  images: Map<string, Picture>;
  /** A picture of a video at a time in seconds of the video; the last picture when the time is past its end. */
  frame(url: string, mode: ResizeMode, seconds: number): Promise<Picture | undefined>;
}

type Ctx = OffscreenCanvasRenderingContext2D;

function drawFit(ctx: Ctx, pic: Picture, mode: ResizeMode, W: number, H: number, scaleExtra = 1, panX = 0): void {
  const pw = pic.width;
  const ph = pic.height;
  if (!pw || !ph) return;
  let w = W;
  let h = H;
  if (mode !== 'stretch') {
    const k = mode === 'cover' ? Math.max(W / pw, H / ph) : Math.min(W / pw, H / ph);
    w = pw * k;
    h = ph * k;
  }
  w *= scaleExtra;
  h *= scaleExtra;
  ctx.drawImage(pic, (W - w) / 2 + panX, (H - h) / 2, w, h);
}

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines.slice(0, 8);
}

async function drawLayer(ctx: Ctx, layer: Layer, at: number, clipDuration: number, W: number, H: number, assets: Assets): Promise<void> {
  const local = at - layer.start;
  const span = Math.max(0.001, (layer.stop ?? clipDuration) - layer.start);
  const progress = Math.min(1, Math.max(0, local / span));
  switch (layer.type) {
    case 'fill-color':
      ctx.fillStyle = layer.color;
      ctx.fillRect(0, 0, W, H);
      return;
    case 'gradient': {
      const g = layer.kind === 'linear' ? ctx.createLinearGradient(0, 0, 0, H) : ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) / 1.4);
      g.addColorStop(0, layer.colors[0]);
      g.addColorStop(1, layer.colors[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    case 'text': {
      const size = Math.round(layer.fontSize * H);
      ctx.font = `${layer.style === 'subtitle' ? '600' : '700'} ${size}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = wrap(ctx, layer.text, W * 0.88);
      const lineHeight = size * 1.2;
      let cx = layer.position.x * W;
      const cy = layer.position.y * H;
      let alpha = 1;
      if (layer.style === 'slide-in-text') {
        const p = ease('ease-out-back', Math.min(1, local / 0.7));
        cx -= (1 - p) * W * 0.4;
        alpha = Math.min(1, local / 0.35);
      }
      if (layer.style === 'title-background') {
        ctx.fillStyle = layer.background;
        ctx.fillRect(0, 0, W, H);
      }
      const top = cy - ((lines.length - 1) * lineHeight) / 2;
      if (layer.style === 'news-title' || layer.style === 'subtitle') {
        const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
        ctx.fillStyle = layer.style === 'subtitle' ? 'rgba(0,0,0,0.6)' : layer.background;
        const padX = size * 0.6;
        const padY = size * 0.35;
        ctx.fillRect(cx - widest / 2 - padX, top - lineHeight / 2 - padY, widest + padX * 2, lines.length * lineHeight + padY * 2);
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = size * 0.12;
      }
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.fillStyle = layer.color;
      lines.forEach((l, i) => ctx.fillText(l, cx, top + i * lineHeight));
      ctx.restore();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      return;
    }
    case 'image': {
      const pic = assets.images.get(layer.url);
      if (!pic) return;
      const k = layer.zoom === 'in' ? 1 + layer.zoomAmount * progress : layer.zoom === 'out' ? 1 + layer.zoomAmount * (1 - progress) : layer.zoom === 'left' || layer.zoom === 'right' ? 1 + layer.zoomAmount : 1;
      const pan = layer.zoom === 'left' ? -layer.zoomAmount * W * (progress - 0.5) : layer.zoom === 'right' ? layer.zoomAmount * W * (progress - 0.5) : 0;
      drawFit(ctx, pic, layer.resizeMode, W, H, k, pan);
      return;
    }
    case 'image-overlay': {
      const pic = assets.images.get(layer.url);
      if (!pic) return;
      const boxW = layer.width * W;
      const boxH = layer.height * H;
      const k = Math.min(boxW / pic.width, boxH / pic.height);
      ctx.drawImage(pic, layer.x * W - (pic.width * k) / 2, layer.y * H - (pic.height * k) / 2, pic.width * k, pic.height * k);
      return;
    }
    case 'video': {
      const pic = await assets.frame(layer.url, layer.resizeMode, layer.cutFrom + Math.max(0, local) * layer.speed);
      if (pic) drawFit(ctx, pic, layer.resizeMode, W, H);
      return;
    }
  }
}

/** The whole picture at time `t` of the video. */
export async function drawFrame(ctx: Ctx, spec: ComposeSpec, t: number, assets: Assets): Promise<void> {
  const { width: W, height: H } = spec;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  for (const placed of layoutAt(spec, t)) {
    const clip = spec.clips[placed.clip]!;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, placed.alpha));
    ctx.translate(W / 2 + placed.dx, H / 2 + placed.dy);
    ctx.scale(placed.scale, placed.scale);
    ctx.translate(-W / 2, -H / 2);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    for (const layer of clip.layers) if (layerActive(layer, placed.at, clip.duration!)) await drawLayer(ctx, layer, placed.at, clip.duration!, W, H, assets);
    ctx.restore();
    if (placed.dim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${placed.dim})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
