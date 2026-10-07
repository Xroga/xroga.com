'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import '@/styles/homepage-capabilities.css';
import { Globe } from '@/components/magicui/globe';
import { HomepageIntegrationConstellation } from '@/components/homepage/integrations/HomepageIntegrationConstellation';
import ShinyText from '@/components/homepage/integrations/ShinyText';

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
      <div className="xcap-copy xcap-copy--shiny">
        <span className="xcap-eyebrow">ONE AI WORKSPACE</span>
        <h3>
          <ShinyText
            text="1,500+ ways to"
            speed={2.4}
            delay={0.25}
            color="var(--xcap-shiny-primary)"
            shineColor="var(--xcap-shiny-highlight)"
            spread={118}
          />
          <span>
            <ShinyText
              text="get work done."
              speed={2.4}
              delay={0.7}
              color="var(--xcap-shiny-secondary)"
              shineColor="var(--xcap-shiny-highlight)"
              spread={118}
            />
          </span>
        </h3>
        <p>
          <ShinyText
            text="Connect business apps, developer tools, APIs and custom MCPs in one workspace."
            speed={3.2}
            delay={1.15}
            color="var(--xcap-shiny-body)"
            shineColor="var(--xcap-shiny-highlight)"
            spread={112}
          />
        </p>
      </div>
    </Card>
  );
}

function KnowledgeCard() {
  const routes = [
    {
      request: 'Audit this repo, fix checkout, and prove the build works.',
      tools: ['Code', 'Browser', 'Tests'],
      result: 'Patch ready · checks passed',
    },
    {
      request: 'Compare the pipeline with CRM data and draft the follow-up.',
      tools: ['CRM', 'Files', 'Web'],
      result: 'Differences reconciled · follow-up ready',
    },
    {
      request: 'Read these contracts and surface the renewal risks.',
      tools: ['Files', 'Research', 'Report'],
      result: 'Risk summary ready · sources attached',
    },
  ] as const;
  const [routeIndex, setRouteIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRouteIndex((index) => (index + 1) % routes.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [routes.length]);

  const route = routes[routeIndex];

  return (
    <Card className="xcap-card--knowledge">
      <div className="xcap-orchestrator-visual" aria-label="Xroga automatically chooses the tools needed for each request">
        <div className="xcap-orchestrator-topbar">
          <span><i /> Xroga routing</span>
          <small>live</small>
        </div>

        <div className="xcap-orchestrator-request" key={`request-${routeIndex}`}>
          <small>YOU ASK</small>
          <strong>{route.request}</strong>
        </div>

        <div className="xcap-orchestrator-path" key={`tools-${routeIndex}`}>
          <span className="xcap-orchestrator-node is-xroga">X</span>
          <i aria-hidden="true" />
          <div>
            {route.tools.map((tool, index) => (
              <span key={tool} style={{ '--route-delay': `${index * 90}ms` } as CSSProperties}>{tool}</span>
            ))}
          </div>
        </div>

        <div className="xcap-orchestrator-result" key={`result-${routeIndex}`}>
          <span>✓</span>
          <div><small>FINISHED RESULT</small><strong>{route.result}</strong></div>
        </div>

        <div className="xcap-orchestrator-progress" aria-hidden="true">
          {routes.map((_, index) => <span className={index === routeIndex ? 'is-active' : ''} key={index} />)}
        </div>
      </div>
      <Copy
        eyebrow="REQUEST · ROUTE · EXECUTE · VERIFY"
        title="One request."
        muted="Whatever the work takes."
        description="Xroga chooses the tools the job needs, coordinates the work, and returns one finished result."
      />
    </Card>
  );
}

function WorkingCard() {
  const [phase, setPhase] = useState<'before' | 'working' | 'verified'>('before');

  return (
    <Card className="xcap-card--working">
      <div className="xcap-workflow-demo xcap-code-workflow" aria-label="Coding experience from a broken project to a verified working product">
        <div className="xcap-workflow-topline">
          <div>
            <span className="xcap-workflow-kicker">CODING EXPERIENCE</span>
            <strong>Prompt → code → tests → working product</strong>
          </div>
          <span className="xcap-workflow-live"><i /> Live build demo</span>
        </div>

        <div className="xcap-workflow-radio-inputs" role="tablist" aria-label="Coding stages">
          {([
            ['before', 'BEFORE'],
            ['working', 'BUILDING'],
            ['verified', 'VERIFIED'],
          ] as const).map(([value, label]) => (
            <label className="xcap-workflow-radio" key={value}>
              <input
                type="radio"
                name="xcap-code-stage"
                checked={phase === value}
                onChange={() => setPhase(value)}
              />
              <span className="xcap-workflow-radio-name">{label}</span>
            </label>
          ))}
        </div>

        <div className="xcap-code-request">
          <span>&gt; xroga</span>
          <strong>Build a polished checkout, fix the broken payment flow, and verify it end-to-end.</strong>
        </div>

        <div className="xcap-workflow-stage" data-phase={phase} key={phase}>
          {phase === 'before' && (
            <div className="xcap-code-before-panel">
              <div className="xcap-code-panel-head">
                <div><span /><span /><span /></div>
                <strong>Before Xroga · project scan</strong>
                <small>3 blocking issues</small>
              </div>
              <div className="xcap-code-before-grid">
                <div className="xcap-broken-files">
                  <p><b>src/app/checkout/page.tsx</b><span>Type error · paymentResult missing</span></p>
                  <p><b>src/lib/stripe.ts</b><span>Webhook signature path broken</span></p>
                  <p><b>src/components/PayButton.tsx</b><span>Submit state can lock the UI</span></p>
                </div>
                <pre className="xcap-broken-code"><code><span>41</span> const total = cart.total.toFixed(2){'\n'}<span>42</span> const payment = await createPayment(total){'\n'}<em>   ~~~~~~~~~ cart.total may be undefined</em></code></pre>
              </div>
            </div>
          )}

          {phase === 'working' && (
            <div className="xcap-ui-loader xcap-term" role="status" aria-label="Xroga building and verifying the project">
              <div className="xcap-term-bar">
                <span className="xcap-term-dot" /><span className="xcap-term-dot" /><span className="xcap-term-dot" />
                <div className="xcap-term-title">xroga.build</div>
              </div>
              <div className="xcap-term-body">
                <div className="xcap-term-line"><b>$</b> inspect repo --task checkout</div>
                <div className="xcap-term-line xcap-term-muted">› mapping payment flow and affected files…</div>
                <div className="xcap-term-line"><span className="xcap-term-tag xcap-term-ok">✓</span> patching checkout + Stripe path</div>
                <div className="xcap-term-line"><span className="xcap-term-tag xcap-term-ok">✓</span> repairing loading + error states</div>
                <div className="xcap-term-line"><span className="xcap-term-tag xcap-term-run">●</span> typecheck · tests · browser verification <span className="xcap-term-cursor" aria-hidden="true" /></div>
                <div className="xcap-term-progress"><span className="xcap-term-fill" /><span className="xcap-term-glint" aria-hidden="true" /></div>
              </div>
            </div>
          )}

          {phase === 'verified' && (
            <div className="xcap-verified-terminal">
              <div className="xcap-verified-bar"><span><i /><i /><i /></span><b>Working product</b><small>verified</small></div>
              <div className="xcap-verified-body">
                <p className="xcap-verified-command">&gt; xroga verify --checkout</p>
                <p style={{ '--verify-delay': '0ms' } as CSSProperties}>✔ 3 files repaired</p>
                <p style={{ '--verify-delay': '220ms' } as CSSProperties}>✔ TypeScript check passed</p>
                <p style={{ '--verify-delay': '440ms' } as CSSProperties}>✔ Checkout tests passed</p>
                <p style={{ '--verify-delay': '660ms' } as CSSProperties}>✔ Browser flow completed</p>
                <div className="xcap-verified-result" style={{ '--verify-delay': '880ms' } as CSSProperties}>
                  <span>Ready</span>
                  <strong>Checkout works · verified preview ready</strong>
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
