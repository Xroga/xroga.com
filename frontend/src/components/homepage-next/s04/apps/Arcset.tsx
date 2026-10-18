'use client';

/**
 * Arcset: a fictional strength-training app for iPhone, drawn at its natural size (280 × 600).
 * Three real screens: Today (the live workout, where set 3 is logged), Progress and Plan. The store screenshots are
 * captured from these same screens. Colours stay inside the app; the release environment around it is Xroga's.
 */
import { useId, type ReactNode } from 'react';
import a from './Arcset.module.css';

export type ArcsetScreen = 'today' | 'progress' | 'plan';

export function ArcsetIcon({ size = 40 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={a.icon} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`ai${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#172225" />
          <stop offset="1" stopColor="#0a1012" />
        </linearGradient>
        <linearGradient id={`ar${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3cc7a5" />
          <stop offset="1" stopColor="#b8f5c8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#ai${id})`} />
      <path d="M16 44a17 17 0 1 1 32 0" fill="none" stroke="#24363a" strokeWidth="6" strokeLinecap="round" />
      <path d="M16 44a17 17 0 0 1 27.6-19.8" fill="none" stroke={`url(#ar${id})`} strokeWidth="6" strokeLinecap="round" />
      <rect x="24" y="41" width="16" height="4.5" rx="2.25" fill="#e9f3f0" />
    </svg>
  );
}

/** the iOS status bar for a Dynamic Island iPhone (time, island, cellular, Wi-Fi, battery); colour from the parent */
export function StatusBar({ className }: { className?: string }) {
  return (
    <div className={`${a.status} ${className ?? ''}`} aria-hidden="true">
      <span>9:41</span>
      <i className={a.island} />
      <span className={a.sysIcons}>
        <svg width="16" height="10" viewBox="0 0 16 10">
          <rect x="0" y="6" width="3" height="4" rx="0.8" fill="currentColor" />
          <rect x="4.3" y="4" width="3" height="6" rx="0.8" fill="currentColor" />
          <rect x="8.6" y="2" width="3" height="8" rx="0.8" fill="currentColor" />
          <rect x="12.9" y="0" width="3" height="10" rx="0.8" fill="currentColor" />
        </svg>
        <svg width="14" height="10" viewBox="0 0 14 10">
          <path d="M7 9.6 4.9 7.5a3 3 0 0 1 4.2 0z" fill="currentColor" />
          <path d="M2.8 5.4a6 6 0 0 1 8.4 0l-1.1 1.1a4.4 4.4 0 0 0-6.2 0z" fill="currentColor" />
          <path d="M.6 3.2a9.1 9.1 0 0 1 12.8 0l-1.1 1.1a7.5 7.5 0 0 0-10.6 0z" fill="currentColor" />
        </svg>
        <svg width="20" height="10" viewBox="0 0 22 11">
          <rect x="0.5" y="0.5" width="18" height="10" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.5" />
          <rect x="2" y="2" width="13" height="7" rx="1.6" fill="currentColor" />
          <rect x="19.6" y="3.5" width="1.6" height="4" rx="0.8" fill="currentColor" fillOpacity="0.5" />
        </svg>
      </span>
    </div>
  );
}

const TABS: { key: ArcsetScreen | 'profile'; label: string; d: string }[] = [
  { key: 'today', label: 'Today', d: 'M4 10.5 12 4l8 6.5V20H4z M9.5 20v-5h5v5' },
  { key: 'plan', label: 'Plan', d: 'M4 6h16v14H4z M4 10h16 M8.5 3.5v4 M15.5 3.5v4' },
  { key: 'progress', label: 'Progress', d: 'M4 19 9.5 12l4 3.5L20 7 M15 7h5v5' },
  { key: 'profile', label: 'Profile', d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5' },
];
function TabBar({ on }: { on: ArcsetScreen }) {
  return (
    <nav className={a.tabs} aria-hidden="true">
      {TABS.map((t) => (
        <span key={t.key} data-on={t.key === on || undefined}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d={t.d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.label}
        </span>
      ))}
    </nav>
  );
}

function Frame({ children, tab }: { children: ReactNode; tab: ArcsetScreen }) {
  return (
    <div className={a.app}>
      <StatusBar />
      <div className={a.body}>{children}</div>
      <TabBar on={tab} />
      <i className={a.home} aria-hidden="true" />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ Today */
const SETS = [
  { n: 1, prev: '22.5 × 10', kg: '22.5', reps: '10' },
  { n: 2, prev: '22.5 × 10', kg: '22.5', reps: '10' },
  { n: 3, prev: '22.5 × 9', kg: '25', reps: '8' },
];

export function ArcsetToday({ logged, live = false, onAction }: { logged: boolean; live?: boolean; onAction?: () => void }) {
  const done = logged ? 8 : 7;
  return (
    <Frame tab="today">
      <header className={a.top}>
        <span className={a.back}>
          <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
            <path d="M8 2 2 8l6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Today
        </span>
        <span className={a.clock}>
          <i />
          {logged ? '32:41' : '31:05'}
        </span>
        <span className={a.finish}>Finish</span>
      </header>
      <div className={a.titleBlock}>
        <small>Week 6 · Push day</small>
        <b>Upper Strength</b>
      </div>
      <div className={a.progress} aria-hidden="true">
        <span className={a.bars}>
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} data-on={i < done || undefined} data-new={(logged && i === 7) || undefined} />
          ))}
        </span>
        <span className={a.progressText}>
          <b>{done} of 12 sets</b>
          <span>{logged ? '5,045' : '4,845'} kg volume</span>
        </span>
      </div>
      <section className={a.exercise}>
        <header className={a.exHead}>
          <span className={a.exThumb} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className={a.exName}>
            <b>Incline Press</b>
            <small>Dumbbell · Chest</small>
          </span>
          {logged && <em className={a.best}>New best</em>}
        </header>
        <div className={a.setHead} aria-hidden="true">
          <span>Set</span>
          <span>Previous</span>
          <span>kg</span>
          <span>Reps</span>
          <span />
        </div>
        <ol className={a.sets} data-r="sets">
          {SETS.map((s) => {
            const isDone = s.n < 3 || logged;
            const active = s.n === 3;
            return (
              <li key={s.n} data-done={isDone || undefined} data-active={(active && !logged) || undefined} data-fresh={(active && logged) || undefined}>
                <span className={a.setN}>{s.n}</span>
                <span className={a.prev}>{s.prev}</span>
                <span className={a.val}>{s.kg}</span>
                <span className={a.val}>{s.reps}</span>
                {active ? (
                  <span className={a.checkWrap} data-r="btn">
                    {live ? (
                      <button type="button" className={a.check} data-on={logged || undefined} aria-pressed={logged} aria-label="Complete set 3" onClick={onAction}>
                        <CheckMark />
                      </button>
                    ) : (
                      <span className={a.check} data-on={logged || undefined}>
                        <CheckMark />
                      </span>
                    )}
                  </span>
                ) : (
                  <span className={a.check} data-on="">
                    <CheckMark />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>
      {/* after the set is logged: the rest timer takes the place of the next-exercise card */}
      <div className={a.next} data-r="after">
        {logged ? (
          <div className={a.rest}>
            <span className={a.restRing} aria-hidden="true">
              <svg viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="16" fill="none" stroke="#1f2d30" strokeWidth="4" />
                <circle className={a.restArc} cx="20" cy="20" r="16" fill="none" stroke="#5fe3c0" strokeWidth="4" strokeLinecap="round" pathLength={1} />
              </svg>
            </span>
            <span className={a.restText}>
              <small>Rest</small>
              <b>1:30</b>
            </span>
            <span className={a.restNext}>
              <small>Next</small>
              <b>Cable Fly · 3 × 12</b>
            </span>
          </div>
        ) : (
          <div className={a.upNext}>
            <small>Up next</small>
            <b>Cable Fly</b>
            <span>3 × 12 · 15 kg</span>
          </div>
        )}
      </div>
    </Frame>
  );
}
function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------------ Progress */
export function ArcsetProgress() {
  const gid = `aa${useId().replace(/:/g, '')}`;
  const pts = [18.5, 19.5, 20.2, 21.6, 22.1, 23.4, 24.0, 26.1];
  const W = 232;
  const H = 96;
  const x = (i: number) => 6 + (i * (W - 12)) / (pts.length - 1);
  const y = (v: number) => H - 8 - ((v - 17) / 10) * (H - 18);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <Frame tab="progress">
      <div className={a.titleBlock} data-pad="">
        <small>Last 8 weeks</small>
        <b>Progress</b>
      </div>
      <section className={a.card}>
        <span className={a.cardHead}>
          <span>
            <small>Incline Dumbbell Press</small>
            <b>
              26.1 kg <em>est. 1RM</em>
            </b>
          </span>
          <em className={a.up}>+41%</em>
        </span>
        <svg className={a.chart} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5fe3c0" stopOpacity="0.35" />
              <stop offset="1" stopColor="#5fe3c0" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="#1c2a2d" strokeWidth="1" />
          ))}
          <path d={`${line} L${x(pts.length - 1)} ${H} L${x(0)} ${H} Z`} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="#5fe3c0" strokeWidth="2.2" strokeLinejoin="round" />
          <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="4" fill="#0b1012" stroke="#5fe3c0" strokeWidth="2" />
        </svg>
        <span className={a.axis}>
          <span>W1</span>
          <span>W4</span>
          <span>W8</span>
        </span>
      </section>
      <ul className={a.records}>
        <li>
          <span className={a.recIcon} data-k="pr">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 1.8 9.9 5.6l4.2.6-3 2.9.7 4.2L8 11.3l-3.8 2 .7-4.2-3-2.9 4.2-.6z" fill="currentColor" />
            </svg>
          </span>
          <span>
            <b>25 kg × 8</b>
            <small>New best · today</small>
          </span>
        </li>
        <li>
          <span className={a.recIcon}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 13h12M4 13V8M8 13V4M12 13V6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            <b>5,045 kg</b>
            <small>Session volume</small>
          </span>
        </li>
        <li>
          <span className={a.recIcon}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 2c1.5 2.6 4 4.2 4 7.2A4 4 0 0 1 4 9.2C4 7.6 5 6.4 6 5.6c.3 1.4 1 2.2 1.8 2.6C7.6 6 7.6 3.8 8 2z" fill="currentColor" />
            </svg>
          </span>
          <span>
            <b>12 sessions</b>
            <small>Current streak</small>
          </span>
        </li>
      </ul>
    </Frame>
  );
}

/* ------------------------------------------------------------------------------------------------ Plan */
export function ArcsetPlan() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const marks = ['done', '', 'done', '', 'today', '', 'plan'];
  const sessions = [
    { day: 'Mon', name: 'Upper Strength', meta: '6 exercises · 52 min', state: 'done' },
    { day: 'Wed', name: 'Lower Power', meta: '5 exercises · 48 min', state: 'done' },
    { day: 'Fri', name: 'Upper Strength', meta: 'In progress · 8 of 12 sets', state: 'today' },
    { day: 'Sun', name: 'Mobility', meta: '20 min · guided', state: 'plan' },
  ];
  return (
    <Frame tab="plan">
      <div className={a.titleBlock} data-pad="">
        <small>Block 2 · Hypertrophy</small>
        <b>Week 6</b>
      </div>
      <div className={a.week} aria-hidden="true">
        {days.map((d, i) => (
          <span key={i} data-k={marks[i] || undefined}>
            <small>{d}</small>
            <b>{14 + i}</b>
            <i />
          </span>
        ))}
      </div>
      <ul className={a.sessions}>
        {sessions.map((s) => (
          <li key={s.day} data-k={s.state}>
            <span className={a.sDay}>{s.day}</span>
            <span className={a.sText}>
              <b>{s.name}</b>
              <small>{s.meta}</small>
            </span>
            <i aria-hidden="true" />
          </li>
        ))}
      </ul>
      <div className={a.coach}>
        <b>Deload next week</b>
        <small>Volume drops 30% so you recover before block 3.</small>
      </div>
    </Frame>
  );
}

export function Arcset({ screen = 'today', logged, live, onAction }: { screen?: ArcsetScreen; logged: boolean; live?: boolean; onAction?: () => void }) {
  if (screen === 'progress') return <ArcsetProgress />;
  if (screen === 'plan') return <ArcsetPlan />;
  return <ArcsetToday logged={logged} live={live} onAction={onAction} />;
}
