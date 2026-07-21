'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Category =
  | 'Web'
  | 'Chrome'
  | 'Desktop'
  | 'Android'
  | 'iOS'
  | 'Debug'
  | 'Crypto'
  | 'Update';

interface DeskScene {
  id: string;
  category: Category;
  title: string;
  prompt: string;
  agentLines: string[];
  files: Array<{ path: string; diff: string }>;
  previewTitle: string;
  previewUrl: string;
  previewBody: string[];
  codeSnippet: string[];
  shipLabel: string;
  readyMeta: string;
}

const SCENES: DeskScene[] = [
  {
    id: 'web',
    category: 'Web',
    title: 'Ship SaaS landing + auth',
    prompt: 'Build a SaaS landing with auth and billing — push my GitHub and go live on Vercel.',
    agentLines: [
      'Pulse → builder brief ready',
      'Apex drafting app/page.tsx + checkout',
      'Preview hot in Workspace',
      'Push sticky repo · deploy Vercel',
    ],
    files: [
      { path: 'app/page.tsx', diff: '+84 −0' },
      { path: 'app/api/stripe/route.ts', diff: '+46 −0' },
      { path: 'components/Hero.tsx', diff: '+32 −4' },
    ],
    previewTitle: 'Acme SaaS',
    previewUrl: 'you-acme.vercel.app',
    previewBody: ['Ship from a prompt', 'Auth + Stripe wired', 'Your domain · live'],
    codeSnippet: [
      'export default function Home() {',
      '  return <ProductLanding />',
      '}',
    ],
    shipLabel: 'GitHub → Vercel live',
    readyMeta: '+162 −4',
  },
  {
    id: 'chrome',
    category: 'Chrome',
    title: 'Chrome MV3 extension',
    prompt: 'Build a Chrome MV3 extension that clips pages — zip for Releases.',
    agentLines: [
      'Scaffold manifest.json (MV3)',
      'Background + popup UI',
      'Package extension zip',
      'Attach zip on GitHub Releases',
    ],
    files: [
      { path: 'manifest.json', diff: '+28 −0' },
      { path: 'src/popup.tsx', diff: '+55 −0' },
      { path: 'src/background.ts', diff: '+40 −0' },
    ],
    previewTitle: 'Clipper Extension',
    previewUrl: 'chrome://extensions',
    previewBody: ['MV3 service worker', 'Popup ready', 'Zip on Releases'],
    codeSnippet: [
      '"manifest_version": 3,',
      '"action": { "default_popup": "popup.html" }',
    ],
    shipLabel: 'Chrome MV3 zip',
    readyMeta: '+123 −0',
  },
  {
    id: 'desktop',
    category: 'Desktop',
    title: 'Electron desktop app',
    prompt: 'Ship an Electron desktop notes app — installer on GitHub Releases.',
    agentLines: [
      'Electron main + preload',
      'Renderer UI with local vault',
      'Build unsigned installers',
      'Publish zips to Releases',
    ],
    files: [
      { path: 'electron/main.ts', diff: '+70 −0' },
      { path: 'src/App.tsx', diff: '+90 −0' },
      { path: 'package.json', diff: '+18 −2' },
    ],
    previewTitle: 'Notes Desktop',
    previewUrl: 'app://notes',
    previewBody: ['Native window', 'Local files', 'Installer ready'],
    codeSnippet: [
      'app.whenReady().then(() => {',
      '  createWindow()',
      '})',
    ],
    shipLabel: 'Desktop installer',
    readyMeta: '+178 −2',
  },
  {
    id: 'android',
    category: 'Android',
    title: 'Expo Android app',
    prompt: 'Build an Expo Android app for field check-ins — EAS on my account.',
    agentLines: [
      'Expo Router screens',
      'Check-in form + offline queue',
      'Push to GitHub',
      'EAS Android build queued',
    ],
    files: [
      { path: 'app/(tabs)/index.tsx', diff: '+60 −0' },
      { path: 'components/CheckIn.tsx', diff: '+48 −0' },
      { path: 'eas.json', diff: '+22 −0' },
    ],
    previewTitle: 'Field Check-In',
    previewUrl: 'expo://android',
    previewBody: ['Expo Go preview', 'Offline queue', 'EAS build'],
    codeSnippet: [
      'export default function Home() {',
      '  return <CheckInScreen />',
      '}',
    ],
    shipLabel: 'Android · Expo EAS',
    readyMeta: '+130 −0',
  },
  {
    id: 'ios',
    category: 'iOS',
    title: 'Expo iOS app',
    prompt: 'Same product for iOS — TestFlight via my Expo account.',
    agentLines: [
      'Share Expo codebase',
      'iOS permissions + icons',
      'Push sticky repo',
      'EAS iOS → TestFlight path',
    ],
    files: [
      { path: 'app.config.ts', diff: '+24 −3' },
      { path: 'app/(tabs)/profile.tsx', diff: '+44 −0' },
      { path: 'assets/icon.png', diff: 'asset' },
    ],
    previewTitle: 'Field Check-In iOS',
    previewUrl: 'expo://ios',
    previewBody: ['Shared RN code', 'iOS chrome', 'TestFlight ready'],
    codeSnippet: [
      'ios: {',
      '  bundleIdentifier: "com.you.field",',
      '}',
    ],
    shipLabel: 'iOS · Expo EAS',
    readyMeta: '+68 −3',
  },
  {
    id: 'debug',
    category: 'Debug',
    title: 'Debug frontend error',
    prompt: 'Fix hydration mismatch after theme toggle — keep sticky repo.',
    agentLines: [
      'Capture stack + repro',
      'Refract ThemeProvider',
      'Patch layout className drift',
      'Verify · push · redeploy',
    ],
    files: [
      { path: 'app/layout.tsx', diff: '+12 −8' },
      { path: 'components/ThemeProvider.tsx', diff: '+20 −15' },
    ],
    previewTitle: 'Error Lab',
    previewUrl: 'preview.workspace',
    previewBody: ['Hydration fixed', 'Theme stable', 'Redeployed'],
    codeSnippet: [
      '- className={theme}',
      '+ className={mounted ? theme : undefined}',
    ],
    shipLabel: 'Debug → ship',
    readyMeta: '+32 −23',
  },
  {
    id: 'crypto',
    category: 'Crypto',
    title: 'Crypto vault dashboard',
    prompt: 'Crypto staking dashboard with live prices — research then ship.',
    agentLines: [
      'Live web + X research',
      'Prices API + wallet stub',
      'Vault UI in Workspace',
      'Push GitHub · Vercel live',
    ],
    files: [
      { path: 'app/api/prices/route.ts', diff: '+38 −0' },
      { path: 'components/VaultCard.tsx', diff: '+72 −0' },
      { path: 'CRYPTO.md', diff: '+40 −0' },
    ],
    previewTitle: 'Vault Dashboard',
    previewUrl: 'vault.vercel.app',
    previewBody: ['Live prices', 'Wallet connect stub', 'No custody'],
    codeSnippet: [
      'const prices = await getPrices()',
      'return <VaultCard data={prices} />',
    ],
    shipLabel: 'Research → ship',
    readyMeta: '+150 −0',
  },
  {
    id: 'update',
    category: 'Update',
    title: 'Update sticky site',
    prompt: 'Add night/day theme toggle — patch my selected GitHub project.',
    agentLines: [
      'Load sticky repo context',
      'Surgical theme patch',
      'Preview before push',
      'Incremental GitHub commit',
    ],
    files: [
      { path: 'components/ThemeToggle.tsx', diff: '+36 −0' },
      { path: 'app/globals.css', diff: '+22 −4' },
    ],
    previewTitle: 'Theme Toggle',
    previewUrl: 'preview.workspace',
    previewBody: ['Night / day', 'Same repo', 'Incremental push'],
    codeSnippet: [
      '<ThemeToggle />',
      'document.documentElement.dataset.theme = next',
    ],
    shipLabel: 'Edit → push',
    readyMeta: '+58 −4',
  },
] as const;

const READY_POOL = [
  { title: 'Chrome MV3 clipper', meta: '12m · +123', cat: 'Chrome' },
  { title: 'Electron notes installer', meta: '28m · +178', cat: 'Desktop' },
  { title: 'Expo Android check-in', meta: '35m · +130', cat: 'Android' },
  { title: 'Hydration error fix', meta: '8m · +32 −23', cat: 'Debug' },
  { title: 'Crypto vault live', meta: '41m · +150', cat: 'Crypto' },
  { title: 'Night/day theme patch', meta: '6m · +58 −4', cat: 'Update' },
] as const;

export function HomepagePipelineDemo() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [phase, setPhase] = useState(0);
  const [tick, setTick] = useState(0);
  const [pausedUntil, setPausedUntil] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (Date.now() < pausedUntil) {
        setTick((n) => n + 1);
        return;
      }
      setPhase((p) => {
        if (p >= 5) {
          setSceneIdx((i) => (i + 1) % SCENES.length);
          return 0;
        }
        return p + 1;
      });
      setTick((n) => n + 1);
    }, 2200);
    return () => window.clearInterval(t);
  }, [pausedUntil]);

  function selectScene(idx: number) {
    setSceneIdx(idx);
    setPhase(0);
    setPausedUntil(Date.now() + 12_000);
  }

  const scene = SCENES[sceneIdx]!;
  const visibleAgent = scene.agentLines.slice(0, Math.min(phase + 1, scene.agentLines.length));
  const visibleFiles = scene.files.slice(0, Math.min(phase + 1, scene.files.length));
  const showPreview = phase >= 3;
  const shipReady = phase >= 5;

  const inProgress = useMemo(() => {
    const nextIdx = (sceneIdx + 1) % SCENES.length;
    const next = SCENES[nextIdx]!;
    return [
      {
        idx: sceneIdx,
        title: scene.title,
        status: scene.agentLines[Math.min(phase, scene.agentLines.length - 1)]!,
        active: true,
      },
      {
        idx: nextIdx,
        title: next.title,
        status: 'Queued in swarm…',
        active: false,
      },
    ];
  }, [scene, sceneIdx, phase]);

  const readyItems = useMemo(() => {
    const rotate = tick % READY_POOL.length;
    return Array.from({ length: 5 }, (_, i) => {
      const item = READY_POOL[(rotate + i) % READY_POOL.length]!;
      const sceneMatch = SCENES.findIndex((s) => s.category === item.cat);
      return { ...item, sceneIdx: sceneMatch >= 0 ? sceneMatch : 0 };
    });
  }, [tick]);

  return (
    <div className="xv-hc-desk">
      <div className="xv-hc-desk-window">
        <header className="xv-hc-desk-chrome">
          <div className="xv-hc-desk-dots">
            <span />
            <span />
            <span />
          </div>
          <p className="xv-hc-desk-title font-coding">Xroga Workspace</p>
          <span className={cn('xv-hc-desk-pill', shipReady && 'is-live')}>
            {shipReady ? 'SHIPPED' : 'BUILDING'}
          </span>
        </header>

        <div className="xv-hc-desk-body">
          {/* Left: task rail */}
          <aside className="xv-hc-desk-rail">
            <p className="xv-hc-desk-rail-label font-pixel">
              IN PROGRESS <em>{inProgress.length}</em>
            </p>
            <ul className="xv-hc-desk-tasks">
              {inProgress.map((t) => (
                <li key={t.title}>
                  <button
                    type="button"
                    className={cn('xv-hc-desk-task-btn', t.active && 'is-active')}
                    onClick={() => selectScene(t.idx)}
                    aria-pressed={t.active}
                  >
                    <span className="xv-hc-desk-task-ico">
                      {t.active ? (
                        <Loader2 className="w-3 h-3 xv-hc-desk-spin" strokeWidth={2.5} />
                      ) : (
                        <Loader2 className="w-3 h-3 opacity-40" strokeWidth={2} />
                      )}
                    </span>
                    <div>
                      <strong>{t.title}</strong>
                      <span>{t.status}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <p className="xv-hc-desk-rail-label font-pixel xv-hc-desk-rail-label--ready">
              READY FOR REVIEW <em>{readyItems.length}</em>
            </p>
            <ul className="xv-hc-desk-ready">
              {readyItems.map((item) => (
                <li key={`${item.title}-${item.meta}`}>
                  <button
                    type="button"
                    className="xv-hc-desk-task-btn"
                    onClick={() => selectScene(item.sceneIdx)}
                  >
                    <Check className="w-3 h-3" strokeWidth={2.5} />
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.cat} · {item.meta}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Center: agent chat */}
          <section className="xv-hc-desk-main">
            <header className="xv-hc-desk-main-head">
              <span className="xv-hc-desk-cat font-pixel">{scene.category}</span>
              <h3>{scene.title}</h3>
            </header>

            <div className="xv-hc-desk-prompt">
              <span className="font-pixel">YOU</span>
              <p key={`${scene.id}-p`}>{scene.prompt}</p>
            </div>

            <ul className="xv-hc-desk-agent">
              {visibleAgent.map((line, i) => (
                <li
                  key={`${scene.id}-${line}`}
                  className={cn(i === visibleAgent.length - 1 && !shipReady && 'is-live')}
                >
                  <span className="xv-hc-desk-agent-dot" />
                  {line}
                </li>
              ))}
            </ul>

            <div className="xv-hc-desk-files">
              {visibleFiles.map((f) => (
                <div key={f.path} className="xv-hc-desk-file">
                  <code>{f.path}</code>
                  <em>{f.diff}</em>
                </div>
              ))}
            </div>

            <p className="xv-hc-desk-ship font-coding">
              {shipReady ? `✓ ${scene.shipLabel}` : scene.shipLabel}
            </p>

            <div className="xv-hc-desk-composer">
              <span>Plan, search, build anything…</span>
              <em className="font-pixel">Xroga Swarm</em>
            </div>
          </section>

          {/* Right: preview + code */}
          <section className="xv-hc-desk-side">
            <div className={cn('xv-hc-desk-preview', showPreview && 'is-on')}>
              <div className="xv-hc-desk-preview-bar font-coding">
                <span />
                {scene.previewUrl}
              </div>
              <div className="xv-hc-desk-preview-body">
                <p className="xv-hc-desk-preview-brand">{scene.previewTitle}</p>
                {scene.previewBody.map((line) => (
                  <span key={line}>{line}</span>
                ))}
                {shipReady ? (
                  <button type="button" className="xv-hc-desk-deploy" tabIndex={-1}>
                    Live on your domain
                  </button>
                ) : (
                  <button type="button" className="xv-hc-desk-deploy is-wait" tabIndex={-1}>
                    Preview warming…
                  </button>
                )}
              </div>
            </div>

            <div className="xv-hc-desk-code">
              <div className="xv-hc-desk-code-tabs font-coding">
                <span className="is-on">{scene.files[0]?.path.split('/').pop()}</span>
                <span>{scene.readyMeta}</span>
              </div>
              <pre>
                {scene.codeSnippet.map((line) => (
                  <code key={line}>{line}</code>
                ))}
              </pre>
            </div>
          </section>
        </div>

        <footer className="xv-hc-desk-cli">
          <span className="font-pixel">CLI</span>
          <p key={`${scene.id}-${phase}`} className="font-coding">
            {visibleAgent[visibleAgent.length - 1] ?? 'Waiting…'}
            <i className="xv-hc-desk-caret" />
          </p>
        </footer>
      </div>

      <p className="xv-hc-desk-caption">
        Continuous loop — web, Chrome, desktop, Android, iOS, debug, crypto, updates. Real ship
        path: Workspace → GitHub → Vercel / Expo / Releases.
      </p>
    </div>
  );
}
