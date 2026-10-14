/**
 * The signature object: Aurel's launch plane, an editorial product surface with its own artwork, wordmark and live
 * session. It is rendered once and never unmounted; each journey step moves it to a new place and depth, so the same
 * product carries through launch, discovery, campaigns and results. Decorative: the steps describe it in words.
 */
import { useId } from 'react';
import type { Art } from './data';
import { PRODUCT } from './data';
import s from './S03.module.css';

export function AurelMark({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={s.aurelMark}>
      <path d="M4 21V12a8 8 0 0 1 16 0v9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="12" cy="13.5" r="3.2" fill="currentColor" />
    </svg>
  );
}

/** Aurel's campaign artwork. One visual language, three treatments: the audience changes the image, not just words. */
export function Artwork({ art, className }: { art: Art; className?: string }) {
  // gradient ids are unique per instance: a hidden copy elsewhere must never own the definition
  const uid = useId().replace(/:/g, '');
  const sky = `s03-sky-${art}-${uid}`;
  const glow = `s03-glow-${art}-${uid}`;
  return (
    <svg viewBox="0 0 200 240" preserveAspectRatio="xMidYMid slice" className={className} data-art={art} aria-hidden="true">
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={art === 'sun' ? '#3b2233' : art === 'steps' ? '#141c33' : '#1b1d33'} />
          <stop offset="1" stopColor={art === 'sun' ? '#c86a4f' : art === 'steps' ? '#33406a' : '#4a2f45'} />
        </linearGradient>
        <linearGradient id={glow} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={art === 'steps' ? '#cfd8ff' : '#ffd9b8'} />
          <stop offset="1" stopColor={art === 'steps' ? '#8e9ee8' : '#f08a68'} />
        </linearGradient>
      </defs>
      <rect width="200" height="240" fill={`url(#${sky})`} />
      {art === 'arch' && (
        <g>
          <path d="M44 240V160a56 56 0 0 1 112 0v80Z" fill={`url(#${glow})`} opacity="0.95" />
          <path d="M70 240V170a30 30 0 0 1 60 0v70Z" fill="#f6efe4" />
          <circle cx="100" cy="176" r="13" fill="#f08a68" />
          <path d="M0 214h200M0 226h200" stroke="#1b1d33" strokeOpacity="0.25" strokeWidth="3" />
        </g>
      )}
      {art === 'sun' && (
        <g>
          <circle cx="100" cy="166" r="62" fill={`url(#${glow})`} />
          <path d="M0 176h200v7H0zM0 192h200v10H0zM0 210h200v12H0z" fill="#3b2233" opacity="0.75" />
          <path d="M0 226h200v14H0z" fill="#3b2233" />
          <circle cx="152" cy="62" r="5" fill="#ffe7cf" />
        </g>
      )}
      {art === 'steps' && (
        <g>
          <rect x="22" y="190" width="156" height="50" rx="10" fill="#8e9ee8" opacity="0.55" />
          <rect x="44" y="154" width="112" height="46" rx="10" fill="#aab6f2" opacity="0.8" />
          <rect x="66" y="116" width="68" height="46" rx="10" fill={`url(#${glow})`} />
          <circle cx="100" cy="94" r="12" fill="#f6efe4" />
        </g>
      )}
    </svg>
  );
}

export function Artifact() {
  return (
    <div className={s.artifact} aria-hidden="true">
      <span className={s.artSheet} data-n="2" />
      <span className={s.artSheet} data-n="1" />
      <div className={s.artPlane}>
        <div className={s.artArt}>
          <Artwork art="arch" />
        </div>
        <div className={s.artCopy}>
          <span className={s.artBrand}>
            <AurelMark size={20} />
            {PRODUCT.name}
          </span>
          <span className={s.artKicker}>{PRODUCT.category}</span>
          <b className={s.artTitle}>{PRODUCT.promise}</b>
          <span className={s.artSub}>{PRODUCT.sub}</span>
          <span className={s.artRow}>
            <span className={s.artBtn}>Book a quiet hour</span>
            <span className={s.artFaces}>
              <i />
              <i />
              <i />
              <em>6 focusing</em>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
