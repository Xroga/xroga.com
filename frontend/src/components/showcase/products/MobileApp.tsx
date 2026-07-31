'use client';

/**
 * Showcase product: cross-platform mobile app.
 *
 * The app UI is fully interactive inside a phone frame: bottom-tab navigation,
 * a browse list with search, saved items persisted on the device, a detail sheet,
 * and working settings toggles.
 *
 * IMPORTANT — no shipped-release claims. This template produces an Expo project;
 * no APK has been built, no Play Store listing exists, and nothing here is a
 * production mobile release. The banner states that plainly.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { productReset, readLocal, writeLocal } from './shared';

const BRAND = {
  name: 'Fieldbook',
  ink: '#0f1a14',
  paper: '#ffffff',
  subtle: '#f2f7f4',
  border: '#dde8e2',
  muted: '#5f7169',
  accent: '#16a34a',
  accentDeep: '#15803d',
  accentSoft: '#dcfce7',
} as const;

const SAVED_KEY = 'xroga_showcase_mobile_saved_v1';

interface Entry {
  id: string;
  title: string;
  category: 'Trails' | 'Birds' | 'Plants' | 'Skies';
  region: string;
  summary: string;
  detail: string;
  minutes: number;
  hue: number;
}

/** Sample field-notes content. Invented entries, not a real dataset. */
const ENTRIES: readonly Entry[] = [
  { id: 'fb-1', title: 'Ridge loop at dawn', category: 'Trails', region: 'North fells', summary: 'A short exposed loop best walked before the wind picks up.', detail: 'Roughly four kilometres with one steep section near the col. The ground drains poorly after rain, so the middle third stays soft well into summer.', minutes: 6, hue: 152 },
  { id: 'fb-2', title: 'Reed warbler calls', category: 'Birds', region: 'Marsh hide', summary: 'How to separate two similar reed-bed songs by rhythm.', detail: 'Listen for the pacing rather than the notes. One repeats in even couplets; the other runs on in longer, less structured phrases with occasional mimicry.', minutes: 4, hue: 196 },
  { id: 'fb-3', title: 'Hedgerow in late frost', category: 'Plants', region: 'Lower lane', summary: 'What survives a hard frost and what does not.', detail: 'Note which buds are already swollen. After a hard frost the earliest are usually lost, while the later, tighter buds come through unharmed.', minutes: 5, hue: 96 },
  { id: 'fb-4', title: 'Reading a cold front', category: 'Skies', region: 'Anywhere', summary: 'The cloud sequence that usually precedes a sharp change.', detail: 'High wisps thicken to a flat sheet, the light goes dull, then a sharper line arrives with rising wind. The temperature drop often follows the wind, not the rain.', minutes: 7, hue: 214 },
  { id: 'fb-5', title: 'Old quarry track', category: 'Trails', region: 'East quarry', summary: 'A flat there-and-back that stays walkable in poor weather.', detail: 'Hard surface throughout and sheltered on the eastern side. A good option when the tops are in cloud or the wind is up.', minutes: 5, hue: 34 },
  { id: 'fb-6', title: 'Winter finch flocks', category: 'Birds', region: 'Beech stand', summary: 'Why flocks move between the same three stands all winter.', detail: 'They work a food source until it thins, then move on and return later. Watching the rotation tells you more than any single count.', minutes: 6, hue: 274 },
];

const TABS = [
  { id: 'browse', label: 'Browse' },
  { id: 'saved', label: 'Saved' },
  { id: 'settings', label: 'Settings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function EntryArt({ entry, tall = false }: { entry: Entry; tall?: boolean }) {
  const h = entry.hue;
  return (
    <svg viewBox={`0 0 300 ${tall ? 150 : 96}`} preserveAspectRatio="none" aria-hidden className="fb-art-svg">
      <defs>
        <linearGradient id={`fb-g-${entry.id}-${tall ? 't' : 's'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`hsl(${h} 48% 84%)`} />
          <stop offset="100%" stopColor={`hsl(${h + 18} 40% 68%)`} />
        </linearGradient>
      </defs>
      <rect width="300" height={tall ? 150 : 96} fill={`url(#fb-g-${entry.id}-${tall ? 't' : 's'})`} />
      <path
        d={tall ? 'M0 110 L60 70 L110 96 L170 52 L230 84 L300 58 V150 H0Z' : 'M0 70 L54 44 L100 62 L158 32 L214 54 L300 36 V96 H0Z'}
        fill={`hsl(${h} 38% 42%)`}
        opacity="0.5"
      />
      <circle cx="248" cy={tall ? 34 : 26} r={tall ? 16 : 12} fill="#fff" opacity="0.62" />
    </svg>
  );
}

export function MobileApp() {
  const uid = useId();
  const [tab, setTab] = useState<TabId>('browse');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [saved, setSaved] = useState<string[]>([]);
  const [open, setOpen] = useState<Entry | null>(null);
  const [prefs, setPrefs] = useState({ offline: true, largeText: false, notifications: false });

  useEffect(() => {
    setSaved(readLocal<string[]>(SAVED_KEY, []));
  }, []);

  function toggleSaved(id: string) {
    setSaved((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      writeLocal(SAVED_KEY, next);
      return next;
    });
  }

  const browseResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ENTRIES.filter((entry) => {
      if (category !== 'All' && entry.category !== category) return false;
      if (!needle) return true;
      return `${entry.title} ${entry.region} ${entry.summary} ${entry.category}`.toLowerCase().includes(needle);
    });
  }, [query, category]);

  const savedResults = useMemo(() => ENTRIES.filter((entry) => saved.includes(entry.id)), [saved]);

  return (
    <div className={`fb-root${prefs.largeText ? ' fb-root--large' : ''}`}>
      <style>{CSS}</style>

      <div className="fb-page">
        <header className="fb-intro">
          <h1 className="fb-intro-title">{BRAND.name}</h1>
          <p className="fb-intro-body">
            A cross-platform app template. Everything in the frame below is interactive — try the tabs, the search, and
            saving an entry.
          </p>
          <p className="fb-intro-warning" role="note">
            <strong>Not a shipped release.</strong> This template generates an Expo project. No APK has been built, there
            is no Play Store or App Store listing, and this is not a production mobile release. What you see here is the
            app&rsquo;s interface running in a browser.
          </p>
        </header>

        {/* --------------------------------------------------- phone frame */}
        <div className="fb-device-wrap">
          <div className="fb-device" role="group" aria-label={`${BRAND.name} app preview`}>
            <div className="fb-notch" aria-hidden />
            <div className="fb-status" aria-hidden>
              <span>9:41</span>
              <span className="fb-status-icons">
                <svg width="15" height="11" viewBox="0 0 18 12" fill="currentColor">
                  <rect x="0" y="7" width="3" height="5" rx="1" />
                  <rect x="5" y="5" width="3" height="7" rx="1" />
                  <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
                  <rect x="15" y="0" width="3" height="12" rx="1" opacity="0.4" />
                </svg>
                <svg width="20" height="11" viewBox="0 0 24 12" fill="none">
                  <rect x="0.6" y="0.6" width="19" height="10.8" rx="3" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="2.4" y="2.4" width="12" height="7.2" rx="1.6" fill="currentColor" />
                  <path d="M21.4 4v4a2.2 2.2 0 0 0 0-4Z" fill="currentColor" />
                </svg>
              </span>
            </div>

            <div className="fb-screen">
              {/* ------------------------------------------------- browse */}
              {tab === 'browse' && (
                <div className="fb-view">
                  <div className="fb-app-bar">
                    <div>
                      <p className="fb-app-eyebrow">Field notes</p>
                      <h2 className="fb-app-title">Browse</h2>
                    </div>
                    <span className="fb-avatar" aria-hidden>
                      FB
                    </span>
                  </div>

                  <label className="fb-search">
                    <span className="fb-sr">Search entries</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <circle cx="11" cy="11" r="6.4" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <input value={query} placeholder="Search entries" onChange={(event) => setQuery(event.target.value)} />
                  </label>

                  <div className="fb-cats" role="group" aria-label="Category">
                    {['All', 'Trails', 'Birds', 'Plants', 'Skies'].map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`fb-cat${category === option ? ' fb-cat--on' : ''}`}
                        aria-pressed={category === option}
                        onClick={() => setCategory(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>

                  {browseResults.length === 0 ? (
                    <p className="fb-empty">No entries match that search.</p>
                  ) : (
                    <ul className="fb-list">
                      {browseResults.map((entry) => (
                        <li key={entry.id}>
                          <button type="button" className="fb-item" onClick={() => setOpen(entry)}>
                            <span className="fb-item-art">
                              <EntryArt entry={entry} />
                            </span>
                            <span className="fb-item-text">
                              <span className="fb-item-cat">
                                {entry.category} · {entry.minutes} min
                              </span>
                              <span className="fb-item-title">{entry.title}</span>
                              <span className="fb-item-sum">{entry.summary}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* -------------------------------------------------- saved */}
              {tab === 'saved' && (
                <div className="fb-view">
                  <div className="fb-app-bar">
                    <div>
                      <p className="fb-app-eyebrow">On this device</p>
                      <h2 className="fb-app-title">Saved</h2>
                    </div>
                    <span className="fb-count-pill">{savedResults.length}</span>
                  </div>

                  {savedResults.length === 0 ? (
                    <div className="fb-empty-state">
                      <span className="fb-empty-icon" aria-hidden>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M6 4h12v16l-6-4-6 4V4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <p className="fb-empty-title">Nothing saved yet</p>
                      <p className="fb-empty-body">Open an entry from Browse and tap Save to keep it here.</p>
                      <button type="button" className="fb-btn fb-btn--primary fb-btn--sm" onClick={() => setTab('browse')}>
                        Go to Browse
                      </button>
                    </div>
                  ) : (
                    <ul className="fb-list">
                      {savedResults.map((entry) => (
                        <li key={entry.id}>
                          <button type="button" className="fb-item" onClick={() => setOpen(entry)}>
                            <span className="fb-item-art">
                              <EntryArt entry={entry} />
                            </span>
                            <span className="fb-item-text">
                              <span className="fb-item-cat">{entry.category}</span>
                              <span className="fb-item-title">{entry.title}</span>
                              <span className="fb-item-sum">{entry.region}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* ----------------------------------------------- settings */}
              {tab === 'settings' && (
                <div className="fb-view">
                  <div className="fb-app-bar">
                    <div>
                      <p className="fb-app-eyebrow">Preferences</p>
                      <h2 className="fb-app-title">Settings</h2>
                    </div>
                  </div>

                  <ul className="fb-settings">
                    {(
                      [
                        { key: 'offline', label: 'Keep entries offline', hint: 'Store entry text on the device.' },
                        { key: 'largeText', label: 'Larger text', hint: 'Applies immediately in this preview.' },
                        { key: 'notifications', label: 'Notify on new entries', hint: 'No notification is actually sent here.' },
                      ] as const
                    ).map((row) => (
                      <li key={row.key}>
                        <label className="fb-setting">
                          <span>
                            <span className="fb-setting-label">{row.label}</span>
                            <span className="fb-setting-hint">{row.hint}</span>
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={prefs[row.key]}
                            aria-label={row.label}
                            className={`fb-switch${prefs[row.key] ? ' fb-switch--on' : ''}`}
                            onClick={() => setPrefs((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                          >
                            <span className="fb-switch-knob" />
                          </button>
                        </label>
                      </li>
                    ))}
                  </ul>

                  <div className="fb-about">
                    <p className="fb-about-row">
                      <span>Template</span>
                      <span>Expo · React Native</span>
                    </p>
                    <p className="fb-about-row">
                      <span>Saved entries</span>
                      <span>{saved.length}</span>
                    </p>
                    <p className="fb-about-note">
                      Sample content for the Xroga AI Showcase. No account, sync, or store listing exists.
                    </p>
                  </div>
                </div>
              )}

              {/* --------------------------------------------- detail sheet */}
              {open && (
                <div className="fb-sheet-wrap" role="dialog" aria-modal="true" aria-labelledby={`${uid}-sheet`}>
                  <button type="button" className="fb-sheet-scrim" aria-label="Close entry" onClick={() => setOpen(null)} />
                  <div className="fb-sheet">
                    <span className="fb-sheet-grip" aria-hidden />
                    <div className="fb-sheet-art">
                      <EntryArt entry={open} tall />
                    </div>
                    <div className="fb-sheet-body">
                      <p className="fb-item-cat">
                        {open.category} · {open.region} · {open.minutes} min read
                      </p>
                      <h3 id={`${uid}-sheet`} className="fb-sheet-title">
                        {open.title}
                      </h3>
                      <p className="fb-sheet-text">{open.detail}</p>
                      <div className="fb-sheet-actions">
                        <button
                          type="button"
                          className={`fb-btn ${saved.includes(open.id) ? 'fb-btn--outline' : 'fb-btn--primary'}`}
                          onClick={() => toggleSaved(open.id)}
                        >
                          {saved.includes(open.id) ? 'Saved' : 'Save'}
                        </button>
                        <button type="button" className="fb-btn fb-btn--outline" onClick={() => setOpen(null)}>
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* --------------------------------------------------- tab bar */}
            <nav className="fb-tabs" aria-label="App sections">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`fb-tab${tab === item.id ? ' fb-tab--on' : ''}`}
                  aria-current={tab === item.id ? 'page' : undefined}
                  onClick={() => {
                    setTab(item.id);
                    setOpen(null);
                  }}
                >
                  <span className="fb-tab-icon" aria-hidden>
                    {item.id === 'browse' && (
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                        <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                      </svg>
                    )}
                    {item.id === 'saved' && (
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                        <path d="M6 4h12v16l-6-4-6 4V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      </svg>
                    )}
                    {item.id === 'settings' && (
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8L6.2 6.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
${productReset('.fb-root')}
.fb-root {
  --ink: ${BRAND.ink};
  --paper: ${BRAND.paper};
  --subtle: ${BRAND.subtle};
  --border: ${BRAND.border};
  --muted: ${BRAND.muted};
  --accent: ${BRAND.accent};
  --accent-deep: ${BRAND.accentDeep};
  --accent-soft: ${BRAND.accentSoft};
  --app-fs: 14px;
  min-height: 100%; background: linear-gradient(180deg, #eef4f1 0%, #f8fbf9 40%);
  color: var(--ink); line-height: 1.5;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.fb-root--large { --app-fs: 15.5px; }
.fb-root *, .fb-root *::before, .fb-root *::after { box-sizing: border-box; }
.fb-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.fb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.fb-page { display: grid; gap: 30px; max-width: 1080px; margin: 0 auto; padding: 34px 20px 46px; align-items: start; }
.fb-intro-title { margin: 0; font-size: clamp(27px, 3.4vw, 38px); font-weight: 800; letter-spacing: -0.032em; }
.fb-intro-body { margin: 12px 0 0; max-width: 46ch; font-size: 15px; line-height: 1.62; color: var(--muted); }
.fb-intro-warning {
  margin: 20px 0 0; max-width: 52ch; padding: 14px 16px; border-radius: 12px;
  background: #fff8e6; border: 1px solid #f2e2b8; color: #7a5b12; font-size: 13px; line-height: 1.6;
}

/* device */
.fb-device-wrap { display: grid; justify-items: center; }
.fb-device {
  position: relative; width: 100%; max-width: 340px; display: flex; flex-direction: column;
  aspect-ratio: 340 / 690; border-radius: 40px; overflow: hidden;
  background: var(--paper); border: 9px solid #10161a;
  box-shadow: 0 40px 80px -34px rgba(15,26,20,0.55), 0 0 0 1px rgba(0,0,0,0.4) inset;
}
.fb-notch { position: absolute; top: 7px; left: 50%; transform: translateX(-50%); width: 92px; height: 20px; border-radius: 999px; background: #10161a; z-index: 5; }
.fb-status { display: flex; align-items: center; justify-content: space-between; padding: 9px 20px 4px; font-size: 11.5px; font-weight: 700; color: var(--ink); }
.fb-status-icons { display: inline-flex; align-items: center; gap: 5px; }
.fb-screen { position: relative; flex: 1; overflow: hidden; background: var(--paper); }
.fb-view { height: 100%; overflow-y: auto; padding: 6px 16px 16px; font-size: var(--app-fs); }

.fb-app-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0 12px; }
.fb-app-eyebrow { margin: 0; font-size: 10.5px; font-weight: 750; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
.fb-app-title { margin: 1px 0 0; font-size: 22px; font-weight: 800; letter-spacing: -0.028em; }
.fb-avatar { display: grid; place-items: center; width: 33px; height: 33px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-deep); font-size: 11px; font-weight: 800; }
.fb-count-pill { padding: 3px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-deep); font-size: 12px; font-weight: 750; }

.fb-search { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 11px; background: var(--subtle); color: var(--muted); }
.fb-search input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font-size: 13.5px; font-family: inherit; }
.fb-search input:focus { outline: none; }

.fb-cats { display: flex; gap: 6px; margin: 11px 0 4px; overflow-x: auto; padding-bottom: 3px; scrollbar-width: none; }
.fb-cats::-webkit-scrollbar { display: none; }
.fb-cat { flex: none; padding: 5px 12px; border: 1px solid var(--border); border-radius: 999px; background: var(--paper); font-size: 12px; font-weight: 650; color: var(--muted); cursor: pointer; font-family: inherit; }
.fb-cat--on { background: var(--accent); border-color: var(--accent); color: #fff; }

.fb-list { display: grid; gap: 9px; margin: 12px 0 0; padding: 0; list-style: none; }
.fb-item {
  display: flex; gap: 11px; width: 100%; padding: 9px; text-align: left;
  border: 1px solid var(--border); border-radius: 13px; background: var(--paper); cursor: pointer; font-family: inherit;
}
.fb-item:active { background: var(--subtle); }
.fb-item-art { flex: none; width: 66px; height: 62px; border-radius: 9px; overflow: hidden; }
.fb-art-svg { display: block; width: 100%; height: 100%; }
.fb-item-text { display: grid; gap: 2px; min-width: 0; }
.fb-item-cat { margin: 0; font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--accent-deep); }
.fb-item-title { font-size: 13.5px; font-weight: 700; letter-spacing: -0.012em; }
.fb-item-sum { font-size: 12px; line-height: 1.45; color: var(--muted); }

.fb-empty { margin: 26px 0; text-align: center; font-size: 13px; color: var(--muted); }
.fb-empty-state { display: grid; justify-items: center; gap: 7px; padding: 40px 18px; text-align: center; }
.fb-empty-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-deep); }
.fb-empty-title { margin: 6px 0 0; font-size: 14.5px; font-weight: 700; }
.fb-empty-body { margin: 0; max-width: 26ch; font-size: 12.5px; line-height: 1.55; color: var(--muted); }
.fb-empty-state .fb-btn { margin-top: 10px; }

.fb-settings { display: grid; gap: 8px; margin: 6px 0 0; padding: 0; list-style: none; }
.fb-setting { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 13px; border: 1px solid var(--border); border-radius: 12px; background: var(--paper); }
.fb-setting-label { display: block; font-size: 13.5px; font-weight: 650; }
.fb-setting-hint { display: block; margin-top: 2px; font-size: 11.5px; line-height: 1.45; color: var(--muted); }
.fb-switch { flex: none; width: 44px; height: 26px; padding: 3px; border: 0; border-radius: 999px; background: #cbd5d0; cursor: pointer; transition: background 180ms ease; }
.fb-switch--on { background: var(--accent); }
.fb-switch-knob { display: block; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform 180ms ease; box-shadow: 0 1px 3px rgba(0,0,0,0.28); }
.fb-switch--on .fb-switch-knob { transform: translateX(18px); }

.fb-about { margin-top: 16px; padding: 14px; border-radius: 12px; background: var(--subtle); border: 1px solid var(--border); }
.fb-about-row { display: flex; justify-content: space-between; gap: 12px; margin: 0 0 7px; font-size: 12.5px; }
.fb-about-row span:first-child { color: var(--muted); }
.fb-about-row span:last-child { font-weight: 650; }
.fb-about-note { margin: 8px 0 0; font-size: 11.5px; line-height: 1.5; color: var(--muted); }

/* sheet */
.fb-sheet-wrap { position: absolute; inset: 0; z-index: 8; display: flex; flex-direction: column; justify-content: flex-end; }
.fb-sheet-scrim { flex: 1; border: 0; padding: 0; background: rgba(15,26,20,0.44); cursor: pointer; }
.fb-sheet { max-height: 82%; overflow-y: auto; border-radius: 20px 20px 0 0; background: var(--paper); box-shadow: 0 -14px 40px -18px rgba(15,26,20,0.5); }
.fb-sheet-grip { display: block; width: 38px; height: 4px; margin: 8px auto 6px; border-radius: 999px; background: #cbd5d0; }
.fb-sheet-art { height: 128px; }
.fb-sheet-body { padding: 14px 16px 20px; }
.fb-sheet-title { margin: 4px 0 0; font-size: 18px; font-weight: 780; letter-spacing: -0.022em; }
.fb-sheet-text { margin: 9px 0 0; font-size: 13px; line-height: 1.6; color: var(--muted); }
.fb-sheet-actions { display: flex; gap: 8px; margin-top: 18px; }
.fb-sheet-actions .fb-btn { flex: 1; }

/* tabs */
.fb-tabs { display: flex; border-top: 1px solid var(--border); background: rgba(255,255,255,0.96); backdrop-filter: blur(8px); padding-bottom: 6px; }
.fb-tab {
  flex: 1; display: grid; justify-items: center; gap: 3px; padding: 9px 4px 6px;
  border: 0; background: none; font-size: 10.5px; font-weight: 650; color: var(--muted); cursor: pointer; font-family: inherit;
}
.fb-tab--on { color: var(--accent-deep); }
.fb-tab-icon { display: grid; place-items: center; }

/* buttons */
.fb-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 18px; border: 1px solid transparent; border-radius: 999px;
  font-size: 13px; font-weight: 680; cursor: pointer; font-family: inherit;
}
.fb-btn--sm { padding: 8px 15px; font-size: 12.5px; }
.fb-btn--primary { background: var(--accent); color: #fff; }
.fb-btn--outline { background: var(--paper); border-color: var(--border); color: var(--ink); }

@media (min-width: 900px) {
  .fb-page { grid-template-columns: 1fr auto; gap: 54px; padding-top: 54px; }
}
@media (prefers-reduced-motion: reduce) {
  .fb-root *, .fb-root *::before, .fb-root *::after { transition-duration: 0.001ms !important; }
}
`;
