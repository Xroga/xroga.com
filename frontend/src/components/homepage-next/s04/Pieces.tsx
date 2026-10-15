'use client';

/**
 * Shared pieces for both S04 compositions:
 * - StoreMark: a destination identity (mark + exact store name), never an app icon;
 * - Product: the live, clickable example product; Still: the same component rendered again at natural size and
 *   scaled, which is how every capture, lens view and store screenshot is made (same UI, same state);
 * - Artwork: each store's own listing artwork built from those stills;
 * - XrogaLine: Xroga's compact evidence line, with the canonical Xroga mark from the repo.
 */
import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import { ArcsetHistory, ArcsetIcon, ArcsetPlan, ArcsetScreen, LensIcon, MerchantLensBrowser, RidgelineGame, RidgelineIcon } from './Products';
import { STORY, type Dest } from './publish';
import { STORE_MARKS, STORE_MARKS_CLEARED, type StoreId } from './storeMarks';
import x from './Pieces.module.css';

/* ------------------------------------------------------------------------------------------------ store identity */
export function StoreMark({ id, size = 24, tone }: { id: StoreId; size?: number; tone?: 'light' | 'ink' }) {
  const m = STORE_MARKS[id];
  if (!STORE_MARKS_CLEARED) return null;
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
function Shot({ caption, children, captured, tone }: { caption: string; children: ReactNode; captured?: boolean; tone: string }) {
  return (
    <figure className={x.shot} data-captured={captured || undefined} style={{ ['--tone' as string]: tone }}>
      <figcaption>{caption}</figcaption>
      <span className={x.shotDevice}>{children}</span>
      {captured && <em className={x.fromTest}>From the test</em>}
    </figure>
  );
}

export function Artwork({ dest, scale = 1 }: { dest: Dest; scale?: number }) {
  const S = STORY[dest];
  const I = PRODUCT_ICON[dest];
  const k = (n: number) => n * scale;
  return (
    <div className={x.art} data-dest={dest} style={{ ['--s' as string]: scale }}>
      <header className={x.artHead}>
        <I size={k(44)} />
        <span>
          <b>{S.product}</b>
          <small>{S.tagline}</small>
        </span>
        <span className={x.artStore}>
          <StoreMark id={S.store} size={k(18)} tone="ink" />
          {S.storeName}
        </span>
      </header>
      {dest === 'ios' && (
        <div className={x.shots}>
          <Shot caption="Log every set in one tap" tone="#16353a" captured>
            <Still w={k(132)} h={k(232)} k={k(0.62)} y={8}>
              <ArcsetScreen done />
            </Still>
          </Shot>
          <Shot caption="Watch your strength grow" tone="#1d2a3a">
            <Still w={k(132)} h={k(232)} k={k(0.62)} y={8}>
              <ArcsetHistory />
            </Still>
          </Shot>
          <Shot caption="A plan for every week" tone="#2b2f3a">
            <Still w={k(132)} h={k(232)} k={k(0.62)} y={8}>
              <ArcsetPlan />
            </Still>
          </Shot>
        </div>
      )}
      {dest === 'android' && (
        <div className={x.wide}>
          <figure className={x.feature} data-captured="">
            <Still w={k(400)} h={k(196)} k={k(0.8)} y={8}>
              <RidgelineGame jumped />
            </Still>
            <span className={x.featureTitle}>
              <b>Ridgeline</b>
              <small>Glide the ridges at dusk</small>
            </span>
            <em className={x.fromTest}>From the test</em>
          </figure>
          <span className={x.dim}>Feature graphic · 1024 × 500</span>
        </div>
      )}
      {dest === 'chrome' && (
        <div className={x.wide} data-row="">
          <figure className={x.cws} data-captured="">
            <Still w={k(300)} h={k(188)} k={k(0.548)} y={0}>
              <MerchantLensBrowser open saved />
            </Still>
            <em className={x.fromTest}>From the test</em>
            <span className={x.dim}>Screenshot · 1280 × 800</span>
          </figure>
          <figure className={x.tile}>
            <span className={x.tileArt} style={{ width: k(150), height: k(95) }}>
              <LensIcon size={k(26)} />
              <b>MerchantLens</b>
              <small>Research as you browse</small>
            </span>
            <span className={x.dim}>Promo tile · 440 × 280</span>
          </figure>
        </div>
      )}
      <p className={x.owner}>
        <i aria-hidden="true" />
        {S.owner}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ Xroga line */
export function XrogaLine({ dest }: { dest: Dest }) {
  const W = STORY[dest].work;
  return (
    <p className={x.xline}>
      <span className={x.xmark}>
        <Image src="/brand/xroga-orb-mark-v2.webp" width={22} height={22} alt="" />
        Xroga
      </span>
      <span data-k="done">{W.tested}</span>
      <span data-k="done">{W.captured}</span>
      <span data-k="done">{W.prepared}</span>
      <span data-k="owner">Your review next</span>
    </p>
  );
}
