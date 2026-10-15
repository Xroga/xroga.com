'use client';

/**
 * The three products being published, each an original fictional app with its own UI and one real action.
 * Their colours stay inside their own screens; the release environment around them is always Xroga's.
 * - Arcset (iPhone): Complete set logs the third set; the ring and the set list update.
 * - Ridgeline (Android game): Jump lifts the glider over the stone gate; the score rises.
 * - MerchantLens (Chrome extension): the toolbar action reads the open product page into the side panel.
 * Device frames are generic and unbranded. Every value is an illustration.
 */
import { useId, type Ref } from 'react';
import p from './Products.module.css';

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ============================================================================================ app icons (the products') */
export function ArcsetIcon({ size = 40 }: { size?: number }) {
  return (
    <svg className={p.icon} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#10171a" />
      <path d="M15 43a18 18 0 1 1 34 0" fill="none" stroke="#24333a" strokeWidth="6" strokeLinecap="round" />
      <path d="M15 43a18 18 0 0 1 29.6-19.7" fill="none" stroke="#5fd4c4" strokeWidth="6" strokeLinecap="round" />
      <rect x="25" y="40" width="14" height="4" rx="2" fill="#e6eeec" />
    </svg>
  );
}
export function RidgelineIcon({ size = 40 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={p.icon} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`ri${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2b483" />
          <stop offset="1" stopColor="#b9667a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#ri${id})`} />
      <circle cx="40" cy="24" r="8" fill="#ffe2bf" />
      <path d="M0 44 16 32l10 7 14-13 24 18v20H0z" fill="#2c4256" />
      <path d="M0 52 20 42l14 6 30-10v26H0z" fill="#1a2a3b" />
      <path d="M18 26l10 4-10 4 3-4z" fill="#fff" />
    </svg>
  );
}
export function LensIcon({ size = 40 }: { size?: number }) {
  return (
    <svg className={p.icon} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#173d6e" />
      <circle cx="28" cy="28" r="13" fill="none" stroke="#f3b45a" strokeWidth="5" />
      <path d="M38 38 48 48" stroke="#f3b45a" strokeWidth="6" strokeLinecap="round" />
      <path d="M21 32l5-5 4 3 6-7" fill="none" stroke="#8fdcb0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ============================================================================================ Arcset — iPhone */
function SetRing({ done }: { done: number }) {
  const r = 34;
  const seg = (i: number) => {
    const a0 = ((-90 + i * 120 + 10) * Math.PI) / 180;
    const a1 = ((-90 + i * 120 + 110) * Math.PI) / 180;
    return `M${r2(44 + r * Math.cos(a0))} ${r2(44 + r * Math.sin(a0))} A${r} ${r} 0 0 1 ${r2(44 + r * Math.cos(a1))} ${r2(44 + r * Math.sin(a1))}`;
  };
  return (
    <svg className={p.ring} viewBox="0 0 88 88" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <path key={i} d={seg(i)} fill="none" stroke={i < done ? '#5fd4c4' : '#22303a'} strokeWidth="7" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** two more real Arcset screens, used as the second and third store screenshots */
export function ArcsetHistory() {
  const weeks = [62, 70, 66, 78, 84, 91];
  return (
    <div className={p.arcset}>
      <div className={p.aStatus}>
        <span>9:41</span>
        <i />
      </div>
      <header className={p.aHead}>
        <small>Incline press</small>
        <b>Getting stronger</b>
      </header>
      <div className={p.aChart}>
        {weeks.map((h, i) => (
          <span key={i}>
            <i style={{ height: `${h}%` }} data-last={i === weeks.length - 1 || undefined} />
            <small>W{i + 1}</small>
          </span>
        ))}
      </div>
      <dl className={p.aMeta} data-wide="">
        <div>
          <dt>Best set</dt>
          <dd>25 kg × 8</dd>
        </div>
        <div>
          <dt>Volume this week</dt>
          <dd>9,840 kg</dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd>12 sessions</dd>
        </div>
      </dl>
      <nav className={p.aTabs} aria-hidden="true">
        <span>Workout</span>
        <span>Plan</span>
        <span data-on="">History</span>
      </nav>
      <i className={p.homeBar} aria-hidden="true" />
    </div>
  );
}
export function ArcsetPlan() {
  return (
    <div className={p.arcset}>
      <div className={p.aStatus}>
        <span>9:41</span>
        <i />
      </div>
      <header className={p.aHead}>
        <small>Week 6 of 8</small>
        <b>Your plan</b>
      </header>
      <ol className={p.aSets}>
        {[
          ['Mon', 'Upper body', 'Done'],
          ['Wed', 'Legs & core', 'Done'],
          ['Fri', 'Upper body', 'Today'],
          ['Sun', 'Mobility', '20 min'],
        ].map(([d, w, s]) => (
          <li key={d + w} data-done={s === 'Done' || undefined} data-now={s === 'Today' || undefined}>
            <span>{d}</span>
            <span>{w}</span>
            <i aria-hidden="true" />
          </li>
        ))}
      </ol>
      <nav className={p.aTabs} aria-hidden="true">
        <span>Workout</span>
        <span data-on="">Plan</span>
        <span>History</span>
      </nav>
      <i className={p.homeBar} aria-hidden="true" />
    </div>
  );
}

export function ArcsetScreen({
  done,
  live = false,
  onAction,
  inspect = false,
  btnRef,
}: {
  done: boolean;
  live?: boolean;
  onAction?: () => void;
  inspect?: boolean;
  btnRef?: Ref<HTMLButtonElement>;
}) {
  const sets = done ? 3 : 2;
  return (
    <div className={p.arcset}>
      <div className={p.aStatus}>
        <span>9:41</span>
        <i />
      </div>
      <header className={p.aHead}>
        <small>Upper body · Week 6</small>
        <b>Incline press</b>
      </header>
      <div className={p.aHero}>
        <SetRing done={sets} />
        <span className={p.aCount}>
          <b>{sets}/3</b>
          <small>sets</small>
        </span>
        <dl className={p.aMeta}>
          <div>
            <dt>Weight</dt>
            <dd>22.5 kg</dd>
          </div>
          <div>
            <dt>Reps</dt>
            <dd>10</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{done ? '32:40' : '31:05'}</dd>
          </div>
        </dl>
      </div>
      <ol className={p.aSets}>
        {[1, 2, 3].map((n) => (
          <li key={n} data-done={n <= sets || undefined} data-now={(!done && n === 3) || undefined}>
            <span>Set {n}</span>
            <span>10 × 22.5 kg</span>
            <i aria-hidden="true" />
          </li>
        ))}
      </ol>
      <span className={p.aBtnWrap}>
        {live ? (
          <button ref={btnRef} type="button" className={p.aBtn} data-done={done || undefined} aria-pressed={done} onClick={onAction}>
            {done ? 'Set logged · Rest 0:45' : 'Complete set'}
          </button>
        ) : (
          <span className={p.aBtn} data-done={done || undefined}>
            {done ? 'Set logged · Rest 0:45' : 'Complete set'}
          </span>
        )}
        {inspect && <i className={p.inspect} aria-hidden="true" />}
      </span>
      <nav className={p.aTabs} aria-hidden="true">
        <span data-on="">Workout</span>
        <span>Plan</span>
        <span>History</span>
      </nav>
      <i className={p.homeBar} aria-hidden="true" />
    </div>
  );
}

/* ============================================================================================ Ridgeline — Android game */
export function RidgelineScene({ jumped }: { jumped: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={p.rArt} viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#36486a" />
          <stop offset="0.55" stopColor="#c98a86" />
          <stop offset="1" stopColor="#f3c49a" />
        </linearGradient>
        <radialGradient id={`sun${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff1dc" />
          <stop offset="0.6" stopColor="#ffd9ad" />
          <stop offset="1" stopColor="#ffd9ad" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`trail${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect width="640" height="300" fill={`url(#sky${id})`} />
      <circle cx="430" cy="150" r="70" fill={`url(#sun${id})`} />
      <circle cx="430" cy="150" r="26" fill="#fff4e3" />
      {/* far ridges */}
      <path d="M0 176 70 140 130 160 210 118 290 150 360 126 440 160 520 132 640 168V300H0z" fill="#8f7a91" opacity="0.75" />
      {/* middle ridges */}
      <path d="M0 206 90 168 160 190 250 150 330 186 420 160 500 196 580 170 640 186V300H0z" fill="#4e5f78" />
      {/* near ridge and path */}
      <path d="M0 240 120 214 240 228 360 206 480 226 640 210V300H0z" fill="#26364a" />
      <path d="M0 262C140 246 260 254 400 244S600 236 640 240V300H0z" fill="#1a2737" />
      <path d="M0 262C140 246 260 254 400 244S600 236 640 240" fill="none" stroke="#f6d3ad" strokeOpacity="0.55" strokeWidth="2" />
      {/* light orbs along the path */}
      {[[150, 228], [196, 214], [242, 206]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="9" fill="#fff1dc" opacity="0.25" />
          <circle cx={x} cy={y} r="4" fill="#fff1dc" />
        </g>
      ))}
      {/* stone gate */}
      <g>
        <path d="M352 246V200a20 20 0 0 1 40 0v46h-10v-44a10 10 0 0 0-20 0v44z" fill="#14202c" />
        <path d="M352 246V200a20 20 0 0 1 20-20" fill="none" stroke="#f6d3ad" strokeOpacity="0.4" strokeWidth="1.5" />
      </g>
      {/* the glider: on the path, or over the gate with its trail */}
      {jumped ? (
        <g>
          <path d="M250 232C290 196 330 168 370 156" stroke={`url(#trail${id})`} strokeWidth="3" fill="none" strokeLinecap="round" />
          <g transform="translate(378 152) rotate(-14)">
            <path d="M-16 0 16 -3 22 0 16 3z" fill="#fff" />
            <path d="M-6 0 6 -14 10 -14 4 0z" fill="#ffe2bf" />
            <path d="M-6 0 6 12 10 12 4 0z" fill="#f2b483" />
          </g>
        </g>
      ) : (
        <g transform="translate(288 236) rotate(-4)">
          <path d="M-16 0 16 -3 22 0 16 3z" fill="#fff" />
          <path d="M-6 0 6 -14 10 -14 4 0z" fill="#ffe2bf" />
          <path d="M-6 0 6 12 10 12 4 0z" fill="#f2b483" />
        </g>
      )}
    </svg>
  );
}

export function RidgelineGame({
  jumped,
  live = false,
  onAction,
  inspect = false,
  btnRef,
}: {
  jumped: boolean;
  live?: boolean;
  onAction?: () => void;
  inspect?: boolean;
  btnRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div className={p.ridge}>
      <RidgelineScene jumped={jumped} />
      <div className={p.rHud} aria-hidden="true">
        <span className={p.rTitle}>Ridgeline</span>
        <span className={p.rScore}>
          <small>Distance</small>
          <b>{jumped ? '1,284' : '1,262'} m</b>
        </span>
        <span className={p.rOrbs}>
          <i />× {jumped ? 18 : 15}
        </span>
        <span className={p.rPause}>
          <i />
          <i />
        </span>
      </div>
      <span className={p.rBtnWrap} data-inspect={inspect || undefined}>
        {live ? (
          <button ref={btnRef} type="button" className={p.rBtn} aria-pressed={jumped} onClick={onAction}>
            Jump
          </button>
        ) : (
          <span className={p.rBtn}>Jump</span>
        )}
        {inspect && (
          <>
            <i className={p.zoneBefore} aria-hidden="true" />
            <i className={p.inspect} aria-hidden="true" />
          </>
        )}
      </span>
      <i className={p.gesture} aria-hidden="true" />
    </div>
  );
}

/* ============================================================================================ MerchantLens — Chrome */
function Bottle({ tone = '#8fa889' }: { tone?: string }) {
  return (
    <svg className={p.bottle} viewBox="0 0 60 130" aria-hidden="true">
      <ellipse cx="30" cy="126" rx="22" ry="3" fill="#000" opacity="0.12" />
      <path d="M12 36c0-7 6-10 9-12h18c3 2 9 5 9 12v80c0 5-3 8-8 8H20c-5 0-8-3-8-8z" fill={tone} />
      <path d="M18 42v68" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.3" />
      <rect x="20" y="9" width="20" height="15" rx="3" fill="#c79563" />
      <rect x="22" y="5" width="16" height="6" rx="2.5" fill="#7c5430" />
    </svg>
  );
}

export function MerchantLensBrowser({
  open,
  saved = false,
  live = false,
  onAction,
  inspect = false,
  btnRef,
}: {
  open: boolean;
  saved?: boolean;
  live?: boolean;
  onAction?: () => void;
  inspect?: boolean;
  btnRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div className={p.browser} data-open={open || undefined}>
      <div className={p.bTabs} aria-hidden="true">
        <span className={p.lights}>
          <i />
          <i />
          <i />
        </span>
        <span className={p.bTab}>Everwell Bottle · Hearth &amp; Hold</span>
      </div>
      <div className={p.bBar}>
        <span className={p.omni} aria-hidden="true">
          hearthandhold.example<span>/everwell-bottle</span>
        </span>
        <span className={p.extWrap}>
          {live ? (
            <button ref={btnRef} type="button" className={p.ext} aria-pressed={open} aria-label="MerchantLens: research this product" onClick={onAction}>
              <LensIcon size={20} />
            </button>
          ) : (
            <span className={p.ext} data-on={open || undefined}>
              <LensIcon size={20} />
            </span>
          )}
          {inspect && <i className={p.inspect} aria-hidden="true" />}
        </span>
      </div>
      <div className={p.bBody}>
        <div className={p.page}>
          <b className={p.storeName}>Hearth &amp; Hold</b>
          <div className={p.prod}>
            <span className={p.prodImg}>
              <Bottle />
            </span>
            <span className={p.prodText}>
              <small>Outdoors · Bottles</small>
              <b data-picked={open || undefined}>Everwell Bottle 24oz</b>
              <span data-picked={open || undefined}>$34.00</span>
              <em>Cold for 24 hours · bamboo lid</em>
              <i className={p.cart}>Add to cart</i>
            </span>
          </div>
        </div>
        {open && (
          <aside className={p.panel} aria-label="MerchantLens">
            <header>
              <LensIcon size={16} />
              <b>MerchantLens</b>
            </header>
            <span className={p.picked}>
              <b>Everwell Bottle 24oz</b>
              <small>$34.00 · this page</small>
            </span>
            <ul>
              <li data-me="">
                <span>This bottle</span>
                <b>$34</b>
              </li>
              <li>
                <span>Steel tumbler</span>
                <b>$28</b>
              </li>
              <li>
                <span>Glass bottle</span>
                <b>$31</b>
              </li>
            </ul>
            <span className={p.save} data-on={saved || undefined}>
              {saved ? 'Saved to shortlist' : 'Save to shortlist'}
            </span>
          </aside>
        )}
      </div>
    </div>
  );
}
