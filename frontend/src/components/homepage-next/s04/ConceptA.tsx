'use client';

/**
 * Concept A · RELEASE LENS. A frameless scene in three planes on one lit floor:
 * front-left, the live product; at the optical centre, Xroga's inspection lens showing the exact control it tested
 * (a magnified copy of the same UI); back-right, the store artwork in shallow perspective, its first screenshot taken
 * from that tested screen. A light cone joins the tested control to the lens and a capture path joins the lens to
 * the screenshot it produced; both are measured from the live DOM. Store identities sit in a calm dock by the heading.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Artwork, LensView, NATURAL, Product, PRODUCT_ICON, StoreMark, TARGET, XrogaLine } from './Pieces';
import { COPY, DESTS, STORY, type Dest, type Origin } from './publish';
import a from './ConceptA.module.css';

type Geo = { cone: string; path: string } | null;

export function ConceptA({
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
  const scene = useRef<HTMLDivElement>(null);
  const sample = useRef<HTMLSpanElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo>(null);

  useLayoutEffect(() => {
    const el = scene.current;
    if (!el) return;
    const measure = () => {
      const s = sample.current?.getBoundingClientRect();
      const l = lens.current?.getBoundingClientRect();
      const shot = el.querySelector<HTMLElement>('[data-captured]')?.getBoundingClientRect();
      const o = el.getBoundingClientRect();
      if (!s || !l || !shot || window.innerWidth <= 700) return setGeo(null);
      const lx = l.left - o.left + l.width / 2;
      const ly = l.top - o.top + l.height / 2;
      const r = l.width / 2;
      const sx = s.right - o.left;
      const sy0 = s.top - o.top;
      const sy1 = s.bottom - o.top;
      // a narrow cone from the tested control to the lens rim
      const cone = `M${sx} ${sy0} L${lx - r * 0.5} ${ly - r * 0.86} L${lx - r * 0.5} ${ly + r * 0.86} L${sx} ${sy1} Z`;
      // the capture path from the lens to the screenshot it produced
      const tx = shot.left - o.left;
      const ty = shot.top - o.top + 40;
      const path = `M${lx + r + 6} ${ly} C${lx + r + 70} ${ly} ${tx - 70} ${ty} ${tx - 4} ${ty}`;
      setGeo({ cone, path });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dest, acted]);

  const t = TARGET[dest];
  return (
    <>
      <div className={a.top}>
        <p className={a.eyebrow}>{COPY.eyebrow}</p>
        <h2 id="s04-title" className={a.title}>
          {COPY.title}
        </h2>
        <div className={a.head}>
          <p className={a.lede}>{COPY.lede}</p>
          <div className={a.origin} role="radiogroup" aria-label="Where your project comes from">
            {(['existing', 'xroga'] as Origin[]).map((o) => (
              <button key={o} type="button" role="radio" aria-checked={origin === o} onClick={() => onOrigin(o)}>
                {COPY.origin[o]}
              </button>
            ))}
          </div>
        </div>
        <div className={a.dock} role="radiogroup" aria-label="Publish to">
          {DESTS.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={dest === d} className={a.plate} onClick={() => onDest(d)}>
              <StoreMark id={STORY[d].store} size={28} />
              <span>
                <b>{STORY[d].storeName}</b>
                <small>{STORY[d].kind}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div ref={scene} className={a.scene} data-dest={dest}>
        <i className={a.floor} aria-hidden="true" />
        <svg className={a.links} aria-hidden="true">
          {geo && (
            <>
              <defs>
                <linearGradient id="s04cone" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#568ffc" stopOpacity="0.28" />
                  <stop offset="1" stopColor="#568ffc" stopOpacity="0.04" />
                </linearGradient>
              </defs>
              <path d={geo.cone} fill="url(#s04cone)" />
              <path d={geo.path} fill="none" stroke="#568ffc" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round" />
            </>
          )}
        </svg>

        <div className={a.src}>
          <p className={a.ask}>
            <I size={22} />
            <span>“{S.ask}”</span>
          </p>
          <div className={a.device} data-dest={dest} style={{ width: NATURAL[dest].w, height: NATURAL[dest].h }}>
            <Product dest={dest} live acted={acted} onAction={onAction} />
            <span ref={sample} className={a.sample} style={{ left: t.x - 5, top: t.y - 5, width: t.w + 10, height: t.h + 10 }} aria-hidden="true" />
          </div>
        </div>

        <div className={a.lensZone}>
          <div ref={lens}>
            {dest === 'ios' && <LensView dest={dest} w={236} h={124} k={1.1} />}
            {dest === 'android' && <LensView dest={dest} w={150} h={150} k={1.6} />}
            {dest === 'chrome' && <LensView dest={dest} w={176} h={112} k={1.7} />}
          </div>
          <p className={a.lensLabel}>
            <b>{S.work.tested}</b>
            <span>{S.lensLabel}</span>
          </p>
        </div>

        <div className={a.dest}>
          <div className={a.artifact}>
            <Artwork dest={dest} scale={dest === 'ios' ? 1 : 1} />
          </div>
          <div className={a.pkg}>
            <span className={a.pkgIcon}>
              <I size={30} />
            </span>
            <span className={a.pkgText}>
              <b>{S.pkg.name}</b>
              <small>{S.pkg.type} · prepared</small>
            </span>
            <span className={a.next}>
              <small>Next · you</small>
              <b>{S.next}</b>
            </span>
          </div>
        </div>
      </div>

      <div className={a.foot}>
        <XrogaLine dest={dest} />
        {cta}
      </div>
    </>
  );
}
