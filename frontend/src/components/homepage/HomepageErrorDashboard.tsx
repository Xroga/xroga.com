'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Code2,
  Database,
  FileWarning,
  GitMerge,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ErrorLane = 'frontend' | 'backend' | 'integration' | 'sensitive' | 'complex';

interface ErrorRow {
  id: string;
  lane: ErrorLane;
  kind: string;
  title: string;
  detail: string;
  status: 'analyzing' | 'refracting' | 'fixed' | 'watching';
}

const LANES: { id: ErrorLane; label: string; Icon: typeof Code2 }[] = [
  { id: 'frontend', label: 'Frontend', Icon: Code2 },
  { id: 'backend', label: 'Backend', Icon: Server },
  { id: 'integration', label: 'Integrations', Icon: Link2 },
  { id: 'sensitive', label: 'Sensitive', Icon: ShieldAlert },
  { id: 'complex', label: 'Complex logic', Icon: Sparkles },
];

const ERROR_FEED: ErrorRow[] = [
  {
    id: 'e1',
    lane: 'frontend',
    kind: 'Debug error',
    title: 'TypeError: Cannot read properties of undefined',
    detail: 'components/Checkout.tsx:84 — null cart before hydrate',
    status: 'analyzing',
  },
  {
    id: 'e2',
    lane: 'frontend',
    kind: 'Edit error',
    title: 'Hydration mismatch after theme toggle patch',
    detail: 'app/layout.tsx vs client ThemeProvider — className drift',
    status: 'refracting',
  },
  {
    id: 'e3',
    lane: 'backend',
    kind: 'Update error',
    title: '500 on /api/billing/webhook after Stripe event shape change',
    detail: 'route.ts — missing invoice.paid branch',
    status: 'analyzing',
  },
  {
    id: 'e4',
    lane: 'backend',
    kind: 'Debug error',
    title: 'Race on session refresh — duplicate JWT writes',
    detail: 'middleware + auth callback both writing cookies',
    status: 'fixed',
  },
  {
    id: 'e5',
    lane: 'integration',
    kind: 'Integration error',
    title: 'GitHub push rejected — stale SHA on sticky repo',
    detail: 'git push · expected ff, got non-fast-forward',
    status: 'refracting',
  },
  {
    id: 'e6',
    lane: 'integration',
    kind: 'Update error',
    title: 'Vercel deploy failed — env SUPABASE_URL missing in preview',
    detail: 'project settings · preview vs production drift',
    status: 'watching',
  },
  {
    id: 'e7',
    lane: 'sensitive',
    kind: 'Sensitive error',
    title: 'Secret leaked in client bundle — API key in NEXT_PUBLIC_',
    detail: 'Scrub · rotate · move to server-only route',
    status: 'analyzing',
  },
  {
    id: 'e8',
    lane: 'complex',
    kind: 'Complex logic',
    title: 'State machine deadlock in multi-step checkout',
    detail: 'Refract reducers · isolate side effects · add invariants',
    status: 'refracting',
  },
];

const STATUS_LABEL: Record<ErrorRow['status'], string> = {
  analyzing: 'Analyzing',
  refracting: 'Refracting',
  fixed: 'Fixed',
  watching: 'Watching',
};

export function HomepageErrorDashboard() {
  const [lane, setLane] = useState<ErrorLane | 'all'>('all');
  const [focus, setFocus] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setFocus((n) => (n + 1) % ERROR_FEED.length);
    }, 2600);
    return () => window.clearInterval(t);
  }, []);

  const visible =
    lane === 'all' ? ERROR_FEED : ERROR_FEED.filter((e) => e.lane === lane);
  const active = ERROR_FEED[focus % ERROR_FEED.length];

  return (
    <section className="xv-hc-err" id="error-lab" aria-labelledby="error-lab-heading">
      <div className="xv-hc-err-inner">
        <header className="xv-hc-err-head">
          <p className="xv-hc-err-kicker font-pixel">ERROR LAB</p>
          <h2 id="error-lab-heading" className="xv-hc-err-title">
            One dashboard for every error you face.
          </h2>
          <p className="xv-hc-err-sub">
            Debug errors · update errors · edit errors — frontend, backend, integrations, and
            sensitive failures. The swarm refracts complex logic, traces stack paths, and ships the
            fix in the same loop.
          </p>
        </header>

        <div className="xv-hc-err-dash">
          <div className="xv-hc-err-chrome" aria-hidden>
            <div className="xv-hc-err-dots">
              <span />
              <span />
              <span />
            </div>
            <span className="xv-hc-err-chrome-path font-coding">
              <Bug className="w-3 h-3" />
              workspace · error lab · live diagnose
            </span>
            <span className="xv-hc-err-livepill">
              <Loader2 className="w-3 h-3 xv-hc-err-spin" />
              SCANNING
            </span>
          </div>

          <div className="xv-hc-err-body">
            <aside className="xv-hc-err-rail">
              <p className="xv-hc-err-rail-label font-pixel">LANES</p>
              <button
                type="button"
                className={cn('xv-hc-err-lane', lane === 'all' && 'is-active')}
                onClick={() => setLane('all')}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                All errors
              </button>
              {LANES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={cn('xv-hc-err-lane', lane === id && 'is-active')}
                  onClick={() => setLane(id)}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}

              <div className="xv-hc-err-kinds">
                <p className="xv-hc-err-rail-label font-pixel">KINDS</p>
                <ul>
                  <li>
                    <Bug className="w-3 h-3" /> Debug error
                  </li>
                  <li>
                    <RefreshCw className="w-3 h-3" /> Update error
                  </li>
                  <li>
                    <Pencil className="w-3 h-3" /> Edit error
                  </li>
                  <li>
                    <GitMerge className="w-3 h-3" /> Integration error
                  </li>
                  <li>
                    <ShieldAlert className="w-3 h-3" /> Sensitive error
                  </li>
                </ul>
              </div>
            </aside>

            <div className="xv-hc-err-main">
              <div className="xv-hc-err-focus">
                <div className="xv-hc-err-focus-top">
                  <span className={cn('xv-hc-err-badge', `is-${active.status}`)}>
                    {STATUS_LABEL[active.status]}
                  </span>
                  <span className="xv-hc-err-kind font-coding">{active.kind}</span>
                  <span className="xv-hc-err-lane-tag">{active.lane}</span>
                </div>
                <h3 className="xv-hc-err-focus-title">{active.title}</h3>
                <p className="xv-hc-err-focus-detail font-coding">{active.detail}</p>
                <div className="xv-hc-err-trace">
                  <span className="xv-hc-err-trace-label font-pixel">REFRACT</span>
                  <ol>
                    <li className={cn(active.status !== 'watching' && 'is-on')}>
                      Capture stack + repro
                    </li>
                    <li
                      className={cn(
                        (active.status === 'analyzing' ||
                          active.status === 'refracting' ||
                          active.status === 'fixed') &&
                          'is-on'
                      )}
                    >
                      Analyze complex error logic
                    </li>
                    <li
                      className={cn(
                        (active.status === 'refracting' || active.status === 'fixed') && 'is-on'
                      )}
                    >
                      Refract sensitive paths · isolate blast radius
                    </li>
                    <li className={cn(active.status === 'fixed' && 'is-on')}>
                      Patch · verify · ship sticky repo
                    </li>
                  </ol>
                </div>
              </div>

              <ul className="xv-hc-err-list">
                {visible.map((row) => {
                  const isHot = row.id === active.id;
                  return (
                    <li
                      key={row.id}
                      className={cn('xv-hc-err-row', isHot && 'is-hot', `is-${row.status}`)}
                    >
                      <span className="xv-hc-err-row-ico">
                        {row.status === 'fixed' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : row.status === 'watching' ? (
                          <FileWarning className="w-3.5 h-3.5" />
                        ) : (
                          <Loader2 className="w-3.5 h-3.5 xv-hc-err-spin" />
                        )}
                      </span>
                      <div className="xv-hc-err-row-body">
                        <div className="xv-hc-err-row-meta">
                          <strong>{row.kind}</strong>
                          <span>{row.lane}</span>
                        </div>
                        <p>{row.title}</p>
                      </div>
                      <span className="xv-hc-err-row-status font-coding">
                        {STATUS_LABEL[row.status]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <aside className="xv-hc-err-side">
              <p className="xv-hc-err-rail-label font-pixel">COVERAGE</p>
              <ul className="xv-hc-err-coverage">
                <li>
                  <Code2 className="w-3.5 h-3.5" />
                  <div>
                    <strong>Frontend</strong>
                    <span>Hydration · React · CSS · client crashes</span>
                  </div>
                </li>
                <li>
                  <Server className="w-3.5 h-3.5" />
                  <div>
                    <strong>Backend</strong>
                    <span>API 5xx · races · auth · DB constraints</span>
                  </div>
                </li>
                <li>
                  <Link2 className="w-3.5 h-3.5" />
                  <div>
                    <strong>Integrations</strong>
                    <span>GitHub · Vercel · Stripe · webhooks</span>
                  </div>
                </li>
                <li>
                  <Database className="w-3.5 h-3.5" />
                  <div>
                    <strong>Complex logic</strong>
                    <span>State machines · invariants · refactors</span>
                  </div>
                </li>
                <li>
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <div>
                    <strong>Sensitive</strong>
                    <span>Secrets · PII · permission blast radius</span>
                  </div>
                </li>
              </ul>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
