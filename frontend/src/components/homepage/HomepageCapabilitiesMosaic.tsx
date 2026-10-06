'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import '@/styles/homepage-capabilities.css';
import { Globe } from '@/components/magicui/globe';
import { HomepageIntegrationConstellation } from '@/components/homepage/integrations/HomepageIntegrationConstellation';

const PROBLEMS = ['I can’t code this', 'Research takes all day', 'My tools don’t talk', 'I need more leads', 'Ship this app', 'Update my CRM'];
const PERSONAS = ['Founder', 'Developer', 'Teacher', 'Sales', 'Agency', 'Creator'];
function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <article className={`xcap-card ${className}`}>{children}</article>;
}

function Copy({ eyebrow, title, muted, description }: { eyebrow: string; title: string; muted: string; description: string }) {
  return (
    <div className="xcap-copy">
      <span className="xcap-eyebrow">{eyebrow}</span>
      <h3>{title}<span>{muted}</span></h3>
      <p>{description}</p>
    </div>
  );
}

function GlobalCard() {
  return (
    <Card className="xcap-card--global">
      <div className="xcap-visual xcap-visual--global xcap-magic-globe-demo bg-background relative flex size-full max-w-lg items-center justify-center overflow-hidden rounded-lg border px-40 pt-8 pb-40 md:pb-60">
        <span className="xcap-magic-globe-title pointer-events-none bg-linear-to-b from-black to-gray-300/80 bg-clip-text text-center text-8xl leading-none font-semibold whitespace-pre-wrap text-transparent dark:from-white dark:to-slate-900/10">
          Global
        </span>
        <Globe className="xcap-globe-component top-28" />
        <div className="xcap-magic-globe-shade pointer-events-none absolute inset-0 h-full bg-[radial-gradient(circle_at_50%_200%,rgba(0,0,0,0.2),rgba(255,255,255,0))]" />
      </div>
      <Copy eyebrow="GLOBAL · MULTILINGUAL · VOICE" title="Work in your language." muted="Anywhere." description="Type or speak naturally. Xroga works in the language you already use." />
    </Card>
  );
}

function IntegrationsCard() {
  return (
    <Card className="xcap-card--integrations">
      <div className="xcap-visual xcap-visual--integrations">
        <HomepageIntegrationConstellation />
      </div>
      <Copy
        eyebrow="ONE AI WORKSPACE"
        title="1,500+ ways to"
        muted="get work done."
        description="Connect business apps, developer tools, APIs and custom MCPs in one workspace."
      />
    </Card>
  );
}

function KnowledgeCard() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(305);

  useEffect(() => {
    const onFrameMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const payload = event.data;
      if (!payload || payload.source !== 'xroga-clarity-workflow') return;
      const measuredHeight = Number(payload.height);
      if (!Number.isFinite(measuredHeight)) return;
      setFrameHeight(Math.max(270, Math.min(460, Math.ceil(measuredHeight))));
    };
    window.addEventListener('message', onFrameMessage);
    return () => window.removeEventListener('message', onFrameMessage);
  }, []);

  useEffect(() => {
    const syncFrameTheme = () => {
      const body = document.body;
      const theme = body.classList.contains('theme-black')
        ? 'black'
        : body.classList.contains('theme-gray')
          ? 'gray'
          : body.classList.contains('theme-beige')
            ? 'beige'
            : 'black';
      frameRef.current?.contentWindow?.postMessage({ source: 'xroga-parent-theme', theme }, '*');
    };

    const observer = new MutationObserver(syncFrameTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const timer = window.setTimeout(syncFrameTheme, 0);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return (
    <Card className="xcap-card--knowledge">
      <iframe
        ref={frameRef}
        className="xcap-clarity-frame"
        src="/demos/xroga-clarity-workflow.html"
        title="Interactive Xroga workflow demonstration: automation, code, research, web, chats and files"
        sandbox="allow-scripts"
        loading="eager"
        scrolling="no"
        onLoad={() => {
          const body = document.body;
          const theme = body.classList.contains('theme-black')
            ? 'black'
            : body.classList.contains('theme-gray')
              ? 'gray'
              : body.classList.contains('theme-beige')
                ? 'beige'
                : 'black';
          frameRef.current?.contentWindow?.postMessage({ source: 'xroga-parent-theme', theme }, '*');
        }}
        style={{ height: frameHeight }}
      />
      <Copy
        eyebrow="AUTOMATION · CODE · RESEARCH · WEB · CHATS · FILES"
        title="One request."
        muted="Six ways to work."
        description="Explore automations, coding, research, web browsing, chats and files. Watch each example move from request to result."
      />
    </Card>
  );
}

function WorkingCard() {
  const [phase, setPhase] = useState<'before' | 'working' | 'verified'>('before');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const order: Array<'before' | 'working' | 'verified'> = ['before', 'working', 'verified'];
    const timer = window.setInterval(() => {
      setPhase((current) => order[(order.indexOf(current) + 1) % order.length]);
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

  const copyExample = async () => {
    try {
      await navigator.clipboard.writeText('Find 100 dental clinics, enrich the owners, verify the data, and prepare outreach.');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card className="xcap-card--working">
      <div className="xcap-workflow-demo" aria-label="Example Xroga workflow from request to verified outcome">
        <div className="xcap-workflow-topline">
          <div>
            <span className="xcap-workflow-kicker">EXAMPLE WORKFLOW</span>
            <strong>Request → work → verified result</strong>
          </div>
          <span className="xcap-workflow-live"><i /> Auto demo</span>
        </div>

        <div className="xcap-workflow-radio-inputs" role="tablist" aria-label="Workflow stages">
          {([
            ['before', 'BEFORE'],
            ['working', 'WORKING'],
            ['verified', 'VERIFIED'],
          ] as const).map(([value, label]) => (
            <label className="xcap-workflow-radio" key={value}>
              <input
                type="radio"
                name="xcap-workflow-stage"
                checked={phase === value}
                onChange={() => setPhase(value)}
              />
              <span className="xcap-workflow-radio-name">{label}</span>
            </label>
          ))}
        </div>

        <div className="xcap-workflow-stage" data-phase={phase} key={phase}>
          {phase === 'before' && (
            <div className="xcap-terminal-card">
              <div className="xcap-terminal-wrap">
                <div className="xcap-terminal">
                  <hgroup className="xcap-terminal-head">
                    <p className="xcap-terminal-title">
                      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 15L10 12L7 9M13 15H17M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z" />
                      </svg>
                      Xroga request
                    </p>
                    <button type="button" className="xcap-copy-toggle" onClick={copyExample} aria-label="Copy example request">
                      {copied ? '✓' : (
                        <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
                          <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
                        </svg>
                      )}
                    </button>
                  </hgroup>
                  <div className="xcap-terminal-body">
                    <pre className="xcap-terminal-pre">
                      <code>&gt;&nbsp;</code>
                      <code>xroga&nbsp;</code>
                      <code data-cmd='run "Find 100 dental clinics, enrich owners, verify data, prepare outreach."' className="xcap-terminal-cmd" />
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {phase === 'working' && (
            <div className="xcap-ui-loader xcap-term" role="status" aria-label="Xroga working through the example request">
              <div className="xcap-term-bar">
                <span className="xcap-term-dot" /><span className="xcap-term-dot" /><span className="xcap-term-dot" />
                <div className="xcap-term-title">xroga.run</div>
              </div>
              <div className="xcap-term-body">
                <div className="xcap-term-line"><b>$</b> execute verified workflow</div>
                <div className="xcap-term-line xcap-term-muted">› searching current business sources…</div>
                <div className="xcap-term-line"><span className="xcap-term-tag xcap-term-ok">✓</span> 100 clinics mapped</div>
                <div className="xcap-term-line"><span className="xcap-term-tag xcap-term-ok">✓</span> decision makers enriched</div>
                <div className="xcap-term-line"><span className="xcap-term-tag xcap-term-run">●</span> verifying contacts + preparing outreach <span className="xcap-term-cursor" aria-hidden="true" /></div>
                <div className="xcap-term-progress"><span className="xcap-term-fill" /><span className="xcap-term-glint" aria-hidden="true" /></div>
              </div>
            </div>
          )}

          {phase === 'verified' && (
            <div className="xcap-verified-terminal">
              <div className="xcap-verified-bar"><span><i /><i /><i /></span><b>Verified outcome</b><small>example complete</small></div>
              <div className="xcap-verified-body">
                <p className="xcap-verified-command">&gt; xroga verify --result</p>
                <p style={{ '--verify-delay': '0ms' } as CSSProperties}>✔ Research sources checked</p>
                <p style={{ '--verify-delay': '420ms' } as CSSProperties}>✔ 100 business records structured</p>
                <p style={{ '--verify-delay': '840ms' } as CSSProperties}>✔ Owner/contact fields validated</p>
                <p style={{ '--verify-delay': '1260ms' } as CSSProperties}>✔ Personalized outreach prepared</p>
                <div className="xcap-verified-result" style={{ '--verify-delay': '1680ms' } as CSSProperties}>
                  <span>Ready</span>
                  <strong>100 verified leads · outreach package prepared</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function EveryoneCard() {
  return (
    <Card className="xcap-card--everyone">
      <div className="xcap-visual xcap-visual--everyone" aria-hidden="true">
        <div className="xcap-people"><strong>X</strong>{PERSONAS.map((persona, index) => <span className={`xcap-person xcap-person--${index + 1}`} key={persona}>{persona}</span>)}</div>
        <div className="xcap-problem-marquee"><div>{[...PROBLEMS, ...PROBLEMS].map((problem, index) => <span key={`${problem}-${index}`}>“{problem}”</span>)}</div></div>
      </div>
      <Copy eyebrow="BUILT FOR PEOPLE" title="Don’t learn Xroga." muted="Just ask." description="Technical or not, describe the outcome in ordinary words. Xroga handles the complexity." />
    </Card>
  );
}

export function HomepageCapabilitiesMosaic() {
  return (
    <section className="xcap-section" aria-label="What Xroga can handle">
      <div className="xcap-section-top">
        <h2 className="xcap-section-title">Build and Manage AI Agents<br />for Real-World Tasks</h2>
        <div className="xcap-section-action">
          <a href="/workspace" className="xcap-noise-container" aria-label="Start For Free in Xroga workspace">
            <span className="xcap-gradient-layer xcap-gradient-1" aria-hidden="true" />
            <span className="xcap-gradient-layer xcap-gradient-2" aria-hidden="true" />
            <span className="xcap-gradient-layer xcap-gradient-3" aria-hidden="true" />
            <span className="xcap-top-strip" aria-hidden="true" />
            <span className="xcap-noise-overlay" aria-hidden="true" />
            <span className="xcap-content-wrapper">
              <span className="xcap-publish-btn">Start For Free <span aria-hidden="true">→</span></span>
            </span>
          </a>
        </div>
      </div>
      <div className="xcap-grid">
        <GlobalCard />
        <IntegrationsCard />
        <KnowledgeCard />
        <WorkingCard />
        <EveryoneCard />
      </div>
    </section>
  );
}
