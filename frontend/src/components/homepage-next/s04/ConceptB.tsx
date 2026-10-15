'use client';

/**
 * Concept B · DISTRIBUTION EDITORIAL. An editorial two-page spread under a store masthead.
 * Left page: the request, the live product and, beside it, a contact-sheet strip of what Xroga examined (the tested
 * control, the safe edge, the captured screen), each frame a magnified copy of the same UI.
 * Right page: the printed store artwork at reading size, with the release document emerging from behind it
 * (version, destination, the owner's review and next step). Flat, face-on, typographic; no lens, no perspective.
 */
import type { ReactNode } from 'react';
import { Artwork, NATURAL, Product, PRODUCT_ICON, Still, StoreMark, TARGET, XrogaLine, viewAt } from './Pieces';
import { COPY, DESTS, STORY, type Dest, type Origin } from './publish';
import b from './ConceptB.module.css';

/** a second inspection point per product: the screen edge Xroga keeps clear */
const EDGE: Record<Dest, { x: number; y: number; label: string }> = {
  ios: { x: 107, y: 408, label: 'Home indicator clear' },
  android: { x: 260, y: 230, label: 'Gesture bar clear' },
  chrome: { x: 470, y: 300, label: 'Shortlist saved' },
};

function Frame({ dest, cx, cy, k, label, full }: { dest: Dest; cx: number; cy: number; k: number; label: string; full?: boolean }) {
  const N = NATURAL[dest];
  const w = 120;
  const h = 96;
  const v = viewAt(dest, cx, cy, w, h, k);
  return (
    <figure className={b.frame} data-full={full || undefined}>
      {full ? (
        <Still w={w} h={h} k={Math.min(w / N.w, h / N.h)} className={b.frameStill}>
          <Product dest={dest} />
        </Still>
      ) : (
        <Still w={w} h={h} k={k} x={v.x} y={v.y} className={b.frameStill}>
          <Product dest={dest} />
        </Still>
      )}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function ConceptB({
  dest,
  origin,
  acted,
  onDest,
  onOrigin,
  onAction,
  cta,
}: {
  dest: Dest;
  origin: Origin;
  acted: boolean;
  onDest: (d: Dest) => void;
  onOrigin: (o: Origin) => void;
  onAction: () => void;
  cta: ReactNode;
}) {
  const S = STORY[dest];
  const I = PRODUCT_ICON[dest];
  const t = TARGET[dest];
  const e = EDGE[dest];
  return (
    <>
      <div className={b.head}>
        <p className={b.eyebrow}>{COPY.eyebrow}</p>
        <h2 id="s04-title" className={b.title}>
          {COPY.title}
        </h2>
        <p className={b.lede}>{COPY.lede}</p>
      </div>

      <div className={b.masthead} role="radiogroup" aria-label="Publish to">
        <span className={b.mastLabel}>Publishing to</span>
        {DESTS.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={dest === d} className={b.mastItem} onClick={() => onDest(d)}>
            <StoreMark id={STORY[d].store} size={30} />
            <span>
              <b>{STORY[d].storeName}</b>
              <small>{STORY[d].kind}</small>
            </span>
          </button>
        ))}
      </div>

      <div className={b.spread} data-dest={dest}>
        <div className={b.left}>
          <div className={b.request}>
            <p className={b.ask}>“{S.ask}”</p>
            <div className={b.origin} role="radiogroup" aria-label="Where your project comes from">
              {(['existing', 'xroga'] as Origin[]).map((o) => (
                <button key={o} type="button" role="radio" aria-checked={origin === o} onClick={() => onOrigin(o)}>
                  {COPY.origin[o]}
                </button>
              ))}
            </div>
          </div>
          <div className={b.bench}>
            <div className={b.device} data-dest={dest} style={{ width: NATURAL[dest].w, height: NATURAL[dest].h }}>
              <Product dest={dest} live acted={acted} onAction={onAction} />
            </div>
            <div className={b.strip} aria-label="What Xroga checked">
              <Frame dest={dest} cx={t.x + t.w / 2} cy={t.y + t.h / 2} k={dest === 'ios' ? 0.6 : 1.1} label={S.work.tested} />
              <Frame dest={dest} cx={e.x} cy={e.y - 26} k={dest === 'ios' ? 0.5 : 0.9} label={e.label} />
              <Frame dest={dest} cx={0} cy={0} k={1} label={S.work.captured} full />
            </div>
          </div>
        </div>

        <div className={b.right}>
          <div className={b.sheet}>
            <Artwork dest={dest} scale={dest === 'ios' ? 1.16 : dest === 'chrome' ? 0.98 : 1.1} />
          </div>
          <div className={b.doc} aria-label="Release document">
            <span className={b.docRow}>
              <I size={24} />
              <b>{S.pkg.name}</b>
              <small>{S.pkg.type}</small>
            </span>
            <span className={b.docRow}>
              <small>Destination</small>
              <StoreMark id={S.store} size={18} tone="ink" />
              <b>{S.storeName}</b>
            </span>
            <span className={b.docRow} data-owner="">
              <small>Next · you</small>
              <b>{S.next}</b>
            </span>
          </div>
        </div>
      </div>

      <div className={b.foot}>
        <XrogaLine dest={dest} />
        {cta}
      </div>
    </>
  );
}
