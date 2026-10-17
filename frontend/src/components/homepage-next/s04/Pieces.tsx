'use client';

/**
 * S04 building blocks.
 * - StoreMark: a destination identity (neutral symbol + exact store name until brand clearance), never an app icon.
 * - Product / Still / Fit: the live product, and inert copies of the same component rendered at natural size and
 *   scaled. Every capture, slot and flying asset is a Still of the same UI in the same state, so the picture that
 *   leaves the product is the picture that lands in the store.
 * - CROP: the region of each product that becomes its store asset, already at the store's aspect ratio.
 * - Listings: each store's own page anatomy, assembled around the captured asset (data-slot marks the landing spot).
 */
import { Gamepad2, Puzzle, Smartphone } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArcsetHistory, ArcsetIcon, ArcsetPlan, ArcsetScreen, LensIcon, MerchantLensBrowser, RidgelineGame, RidgelineIcon, RidgelineScene } from './Products';
import { CROP, NATURAL, PANEL, STORY, type Dest } from './publish';
import { STORE_MARKS, STORE_MARKS_CLEARED, type StoreId } from './storeMarks';
import x from './Pieces.module.css';

/* ------------------------------------------------------------------------------------------------ store identity */
/**
 * The store mark only when STORE_MARKS_CLEARED (brand approval recorded in S04_BRAND_ASSET_AUDIT.md); otherwise a
 * neutral symbol for the kind of release beside the store's exact name. Never recoloured, skewed or animated.
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
export { NATURAL, CROP, PANEL };

export function Product({ dest, live, acted = true, onAction, art }: { dest: Dest; live?: boolean; acted?: boolean; onAction?: () => void; art?: boolean }) {
  if (dest === 'ios') return <ArcsetScreen done={acted} live={live} onAction={onAction} />;
  if (dest === 'android') return art ? <RidgelineArt /> : <RidgelineGame jumped={acted} live={live} onAction={onAction} />;
  return <MerchantLensBrowser open={acted} saved={acted} live={live} onAction={onAction} />;
}

/** the gameplay frame as artwork: the same scene without HUD or controls (the treatment a feature graphic gets) */
function RidgelineArt() {
  return (
    <div className={x.ridgeArt}>
      <RidgelineScene jumped />
    </div>
  );
}

/** a scaled, inert copy of real product UI; `x`/`y` shift the view (in natural pixels) */
export function Still({ w, h, k, x: dx = 0, y: dy = 0, children, className, style }: { w: number; h: number; k: number; x?: number; y?: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={`${x.still} ${className ?? ''}`} style={{ width: w, height: h, ...style }} aria-hidden="true" data-still="" {...({ inert: true } as object)}>
      <span className={x.stillInner} style={{ transform: `translate(${-dx * k}px, ${-dy * k}px) scale(${k})` }}>
        {children}
      </span>
    </span>
  );
}

/**
 * A region of a product, scaled to fill the width of its box (measured, so it stays exact at every breakpoint).
 * `guess` is the width used before the first measurement (server render).
 */
export function Fit({ region, children, guess, className }: { region: { x: number; y: number; w: number; h: number }; children: ReactNode; guess: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(guess);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  const k = w / region.w;
  return (
    <span ref={ref} className={`${x.fit} ${className ?? ''}`} style={{ aspectRatio: `${region.w} / ${region.h}` }}>
      <Still w={w} h={region.h * k} k={k} x={region.x} y={region.y}>
        {children}
      </Still>
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------ listings */
type ListingProps = { dest: Dest; filled: boolean; composed: boolean; tileFilled?: boolean };

function Head({ dest, composed, sub }: { dest: Dest; composed: boolean; sub: string }) {
  const S = STORY[dest];
  const I = PRODUCT_ICON[dest];
  return (
    <header className={x.head}>
      <span className={x.appIcon}>
        <I size={dest === 'android' ? 52 : 56} />
      </span>
      <span className={x.headText}>
        <b>{S.product}</b>
        <span className={x.reveal} data-on={composed || undefined}>
          <small>{S.tagline}</small>
          <em>{sub}</em>
        </span>
      </span>
      <span className={x.storeTag}>
        <StoreMark id={S.store} size={14} tone="ink" />
        {S.storeName}
      </span>
    </header>
  );
}

/** App Store: portrait screenshots with a caption band, the tested screen first */
function ListingIOS({ filled, composed }: ListingProps) {
  const shots = [
    { cap: 'Log every set in one tap', body: <ArcsetScreen done />, slot: true },
    { cap: 'Watch your strength grow', body: <ArcsetHistory />, from: 'History screen' },
    { cap: 'A plan for every week', body: <ArcsetPlan />, from: 'Plan screen' },
  ];
  return (
    <div className={x.sheet} data-dest="ios">
      <Head dest="ios" composed={composed} sub="Arcset Labs · Fitness · 4+ · 38 MB" />
      <div className={x.shots}>
        {shots.map((s, i) => (
          <figure key={s.cap} className={x.shot} data-first={s.slot || undefined} data-on={(s.slot ? filled : composed) || undefined} style={{ ['--i' as string]: i }}>
            <figcaption>{s.cap}</figcaption>
            <span className={x.shotScreen} data-slot={s.slot ? 'main' : undefined}>
              {(s.slot ? filled : true) && (
                <Fit region={CROP.ios} guess={104}>
                  {s.body}
                </Fit>
              )}
            </span>
            {s.slot ? <em className={x.from}>From the test</em> : <em className={x.fromQuiet}>{s.from}</em>}
          </figure>
        ))}
      </div>
    </div>
  );
}

/** Google Play: the feature graphic leads, composed from the tested gameplay frame */
function ListingPlay({ filled, composed }: ListingProps) {
  return (
    <div className={x.sheet} data-dest="android">
      <figure className={x.feature}>
        <span className={x.featureSlot} data-slot="main">
          {filled && (
            <Fit region={CROP.android} guess={520}>
              <Product dest="android" art />
            </Fit>
          )}
        </span>
        <span className={x.featureTitle} data-on={composed || undefined}>
          <b>Ridgeline</b>
          <small>Glide the ridges at dusk</small>
        </span>
        <figcaption className={x.spec}>Feature graphic · 1024 × 500</figcaption>
      </figure>
      <Head dest="android" composed={composed} sub="Ridgeline Studio · Arcade · Single player" />
      <div className={x.frames} data-on={composed || undefined}>
        {[false, true].map((j, i) => (
          <span key={i} className={x.frame} style={{ ['--i' as string]: i }}>
            <Fit region={{ x: 0, y: 0, w: 520, h: 244 }} guess={120}>
              <RidgelineGame jumped={j} />
            </Fit>
            <small>{j ? 'After Jump' : 'Before Jump'}</small>
          </span>
        ))}
        <span className={x.framesNote}>Screenshots from the tested session</span>
      </div>
    </div>
  );
}

/** Chrome Web Store: the 1280 × 800 screenshot, then the panel itself becomes the small promo tile */
function ListingCWS({ filled, composed, tileFilled }: ListingProps) {
  return (
    <div className={x.sheet} data-dest="chrome">
      <Head dest="chrome" composed={composed} sub="MerchantLens · Extension · Shopping" />
      <div className={x.cwsMedia}>
        <figure className={x.cwsShot}>
          <span className={x.cwsSlot}>
            <span className={x.cwsWindow} data-slot="main">
              {filled && (
                <Fit region={CROP.chrome} guess={300}>
                  <Product dest="chrome" />
                </Fit>
              )}
            </span>
          </span>
          <figcaption className={x.spec}>Screenshot · 1280 × 800</figcaption>
        </figure>
        <figure className={x.tile}>
          <span className={x.tileArt}>
            <span className={x.tileText} data-on={composed || undefined}>
              <LensIcon size={20} />
              <b>MerchantLens</b>
              <small>Research as you browse</small>
            </span>
            <span className={x.tileSlot} data-slot="tile">
              {tileFilled && (
                <Fit region={PANEL} guess={72}>
                  <Product dest="chrome" />
                </Fit>
              )}
            </span>
          </span>
          <figcaption className={x.spec}>Promo tile · 440 × 280</figcaption>
        </figure>
      </div>
      <dl className={x.disclose} data-on={composed || undefined}>
        <div style={{ ['--i' as string]: 0 }}>
          <dt>Permission</dt>
          <dd>activeTab: reads the open tab only when you click</dd>
        </div>
        <div style={{ ['--i' as string]: 1 }}>
          <dt>Privacy</dt>
          <dd>No personal data collected · drafted, you confirm</dd>
        </div>
      </dl>
    </div>
  );
}

export function Listing(props: ListingProps) {
  if (props.dest === 'ios') return <ListingIOS {...props} />;
  if (props.dest === 'android') return <ListingPlay {...props} />;
  return <ListingCWS {...props} />;
}
