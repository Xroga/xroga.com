'use client';

/**
 * S04 building blocks:
 * - StoreMark: a destination identity (mark + exact store name), never an app icon;
 * - Product: the live, clickable example product; Still: the same component rendered again at natural size and
 *   scaled, which is how every capture, lens view and store screenshot is made (same UI, same state);
 * - Artwork: each store's own listing artwork; its first image is the captured, tested screen.
 */
import { Gamepad2, Puzzle, Smartphone } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { ArcsetHistory, ArcsetIcon, ArcsetPlan, ArcsetScreen, LensIcon, MerchantLensBrowser, RidgelineGame, RidgelineIcon } from './Products';
import { STORY, type Dest } from './publish';
import { STORE_MARKS, STORE_MARKS_CLEARED, type StoreId } from './storeMarks';
import x from './Pieces.module.css';

/* ------------------------------------------------------------------------------------------------ store identity */
/**
 * The destination's identity: the store mark only when STORE_MARKS_CLEARED (brand approval recorded in
 * S04_BRAND_ASSET_AUDIT.md); otherwise a neutral symbol for the kind of release, beside the store's exact name.
 * The mark itself is never recoloured, skewed or animated; selection light belongs to its container.
 */
const NEUTRAL: Record<StoreId, typeof Smartphone> = { appstore: Smartphone, googleplay: Gamepad2, chromewebstore: Puzzle };
export function StoreMark({ id, size = 24, tone }: { id: StoreId; size?: number; tone?: 'light' | 'ink' }) {
  const m = STORE_MARKS[id];
  if (!STORE_MARKS_CLEARED) {
    const N = NEUTRAL[id];
    return <N className={x.mark} width={size} height={size} strokeWidth={1.6} aria-hidden="true" />;
  }
  const fill = id === 'googleplay' ? (tone === 'ink' ? '#3c4043' : '#ECE9E2') : m.hex;
  return (
    <svg className={x.mark} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={`${m.name} mark`}>
      <path d={m.d} fill={fill} />
    </svg>
  );
}

export const PRODUCT_ICON: Record<Dest, (p: { size?: number }) => JSX.Element> = { ios: ArcsetIcon, android: RidgelineIcon, chrome: LensIcon };

/* ------------------------------------------------------------------------------------------------ products */
export const NATURAL: Record<Dest, { w: number; h: number }> = {
  ios: { w: 214, h: 432 },
  android: { w: 520, h: 244 },
  chrome: { w: 548, h: 318 },
};
/** where Xroga's test points, in the product's own coordinates */
export const TARGET: Record<Dest, { x: number; y: number; w: number; h: number }> = {
  ios: { x: 13, y: 358, w: 188, h: 46 },
  android: { x: 438, y: 150, w: 64, h: 64 },
  chrome: { x: 509, y: 33, w: 32, h: 32 },
};

export function Product({ dest, live, acted = true, onAction }: { dest: Dest; live?: boolean; acted?: boolean; onAction?: () => void }) {
  if (dest === 'ios') return <ArcsetScreen done={acted} live={live} onAction={onAction} />;
  if (dest === 'android') return <RidgelineGame jumped={acted} live={live} onAction={onAction} />;
  return <MerchantLensBrowser open={acted} saved={acted} live={live} onAction={onAction} />;
}

/** the view origin for a w×h window at scale k centred on (cx, cy), kept inside the product */
export function viewAt(dest: Dest, cx: number, cy: number, w: number, h: number, k: number) {
  const N = NATURAL[dest];
  const vw = w / k;
  const vh = h / k;
  return { x: Math.max(0, Math.min(N.w - vw, cx - vw / 2)), y: Math.max(0, Math.min(N.h - vh, cy - vh / 2)) };
}

/** a scaled, inert copy of real product UI; `x`/`y` shift the view (in natural pixels) */
export function Still({ w, h, k, x: dx = 0, y: dy = 0, children, className, style }: { w: number; h: number; k: number; x?: number; y?: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={`${x.still} ${className ?? ''}`} style={{ width: w, height: h, ...style }} aria-hidden="true" {...({ inert: true } as object)}>
      <span className={x.stillInner} style={{ transform: `translate(${-dx * k}px, ${-dy * k}px) scale(${k})` }}>
        {children}
      </span>
    </span>
  );
}

/** the inspection lens: the tested control, magnified from the same live UI */
export function LensView({ dest, w = 176, h = 176, k = 1.7 }: { dest: Dest; w?: number; h?: number; k?: number }) {
  const t = TARGET[dest];
  const v = viewAt(dest, t.x + t.w / 2, t.y + t.h / 2, w, h, k);
  return (
    <span className={x.lens} style={{ width: w, height: h }}>
      <Still w={w} h={h} k={k} x={v.x} y={v.y} className={x.lensStill}>
        <Product dest={dest} />
      </Still>
      <i className={x.reticle} aria-hidden="true" />
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------ store artwork */
/**
 * The captured screen: which region of the product becomes the first store image, and the scale it is shown at.
 * The flying capture and the seated screenshot both render exactly this region, so they are the same picture.
 */
export const CAPTURE: Record<Dest, { x: number; y: number; w: number; h: number; k: number }> = {
  ios: { x: 0, y: 8, w: 214, h: 374, k: 0.6 },
  android: { x: 0, y: 0, w: 520, h: 244, k: 0.74 },
  chrome: { x: 0, y: 0, w: 548, h: 318, k: 0.53 },
};

/** the captured region as a still at scale k */
export function CaptureStill({ dest, k, className }: { dest: Dest; k?: number; className?: string }) {
  const C = CAPTURE[dest];
  const s = k ?? C.k;
  return (
    <Still w={C.w * s} h={C.h * s} k={s} x={C.x} y={C.y} className={className}>
      <Product dest={dest} />
    </Still>
  );
}

function Slot({ dest, filled, slotRef }: { dest: Dest; filled: boolean; slotRef?: (el: HTMLElement | null) => void }) {
  const C = CAPTURE[dest];
  return (
    <span ref={slotRef} className={x.slot} data-filled={filled || undefined} style={{ width: C.w * C.k, height: C.h * C.k }}>
      {filled ? <CaptureStill dest={dest} /> : <small>Screenshot from the tested screen</small>}
      {filled && dest === 'ios' && <em className={x.fromTest}>From the test</em>}
    </span>
  );
}

function Shot({ caption, children, tone, show }: { caption: string; children: ReactNode; tone: string; show: boolean }) {
  return (
    <figure className={x.shot} data-show={show || undefined} style={{ ['--tone' as string]: tone }}>
      <figcaption>{caption}</figcaption>
      <span className={x.shotDevice}>{children}</span>
    </figure>
  );
}

export function Artwork({ dest, filled, assets, slotRef }: { dest: Dest; filled: boolean; assets: boolean; slotRef?: (el: HTMLElement | null) => void }) {
  const S = STORY[dest];
  const I = PRODUCT_ICON[dest];
  const C = CAPTURE[dest];
  return (
    <div className={x.art} data-dest={dest} data-filled={filled || undefined}>
      <header className={x.artHead}>
        <I size={40} />
        <span>
          <b>{S.product}</b>
          {filled ? <small>{S.tagline}</small> : <i className={x.skel} aria-hidden="true" />}
        </span>
        <span className={x.artStore}>
          <StoreMark id={S.store} size={16} tone="ink" />
          {S.storeName} listing
        </span>
      </header>
      {dest === 'ios' && (
        <div className={x.shots}>
          <figure className={x.shot} data-show="" style={{ ['--tone' as string]: '#16353a' }}>
            <figcaption>Log every set in one tap</figcaption>
            <span className={x.shotDevice}>
              <Slot dest={dest} filled={filled} slotRef={slotRef} />
            </span>
          </figure>
          <Shot caption="Watch your strength grow" tone="#1d2a3a" show={assets}>
            <Still w={C.w * C.k} h={C.h * C.k} k={C.k} y={8}>
              <ArcsetHistory />
            </Still>
          </Shot>
          <Shot caption="A plan for every week" tone="#2b2f3a" show={assets}>
            <Still w={C.w * C.k} h={C.h * C.k} k={C.k} y={8}>
              <ArcsetPlan />
            </Still>
          </Shot>
        </div>
      )}
      {dest === 'android' && (
        <div className={x.wide}>
          <figure className={x.feature}>
            <Slot dest={dest} filled={filled} slotRef={slotRef} />
            {filled && assets && (
              <span className={x.featureTitle}>
                <b>Ridgeline</b>
                <small>Glide the ridges at dusk</small>
              </span>
            )}
          </figure>
          <span className={x.dim}>Feature graphic · 1024 × 500 · from the tested gameplay</span>
        </div>
      )}
      {dest === 'chrome' && (
        <div className={x.wide} data-row="">
          <figure className={x.cws}>
            <Slot dest={dest} filled={filled} slotRef={slotRef} />
            <span className={x.dim}>Screenshot · 1280 × 800 · from the test</span>
          </figure>
          <figure className={x.tile} data-show={assets || undefined}>
            <span className={x.tileArt}>
              <LensIcon size={24} />
              <b>MerchantLens</b>
              <small>Research as you browse</small>
            </span>
            <span className={x.dim}>Promo tile · 440 × 280</span>
          </figure>
        </div>
      )}
      <p className={x.owner} data-show={assets || undefined}>
        <i aria-hidden="true" />
        {dest === 'ios' ? 'App privacy answers drafted · you confirm' : dest === 'android' ? 'Data safety answers drafted · you confirm' : 'Permission justification drafted · you confirm'}
      </p>
    </div>
  );
}

