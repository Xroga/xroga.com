'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import '@/styles/homepage-capabilities.css';
import { Globe } from '@/components/magicui/globe';

const INTEGRATIONS = [
  ['googledrive', 'Google Drive'], ['gmail', 'Gmail'], ['slack', 'Slack'], ['github', 'GitHub'], ['notion', 'Notion'],
  ['microsoftteams', 'Microsoft Teams'], ['salesforce', 'Salesforce'], ['hubspot', 'HubSpot'], ['stripe', 'Stripe'], ['shopify', 'Shopify'],
  ['vercel', 'Vercel'], ['supabase', 'Supabase'], ['airtable', 'Airtable'], ['dropbox', 'Dropbox'], ['trello', 'Trello'],
  ['zoom', 'Zoom'], ['discord', 'Discord'], ['linkedin', 'LinkedIn'], ['openai', 'OpenAI'], ['anthropic', 'Anthropic'],
] as const;

const PROBLEMS = ['I can’t code this', 'Research takes all day', 'My tools don’t talk', 'I need more leads', 'Ship this app', 'Update my CRM'];
const PERSONAS = ['Founder', 'Developer', 'Teacher', 'Sales', 'Agency', 'Creator'];
const RUNS = [
  ['Find 100 dental clinics, enrich the owners, and prepare outreach.', ['Understand the outcome', 'Search live sources', 'Connect business tools', 'Prepare verified result']],
  ['Read these files, research the market, and send me the final report.', ['Read files and chats', 'Research current web', 'Compare evidence', 'Return the report']],
  ['Fix checkout, test it on mobile, and ship the verified change.', ['Inspect the project', 'Implement the fix', 'Run browser checks', 'Prepare release']],
] as const;

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

function IntegrationLogo({ slug, label }: { slug: string; label: string }) {
  return (
    <span className="xcap-logo" title={label} aria-label={label}>
      <img
        src={`https://cdn.simpleicons.org/${slug}`}
        alt=""
        loading="lazy"
        onError={(event) => {
          const image = event.currentTarget;
          image.style.display = 'none';
          const parent = image.parentElement;
          if (parent && !parent.querySelector('b')) {
            const fallback = document.createElement('b');
            fallback.textContent = label.slice(0, 2).toUpperCase();
            parent.appendChild(fallback);
          }
        }}
      />
    </span>
  );
}

function OrbitRing({ items, radius, duration, reverse = false }: { items: readonly (readonly [string, string])[]; radius: number; duration: number; reverse?: boolean }) {
  return (
    <div className={`xcap-orbit-ring${reverse ? ' is-reverse' : ''}`} style={{ '--radius': `${radius}px`, '--duration': `${duration}s` } as CSSProperties}>
      <div className="xcap-orbit-rotor">
        {items.map(([slug, label], index) => (
          <div className="xcap-orbit-item" key={slug} style={{ '--angle': `${(360 / items.length) * index}deg` } as CSSProperties}>
            <div className="xcap-orbit-counter"><IntegrationLogo slug={slug} label={label} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GlobalCard() {
  return (
    <Card className="xcap-card--global">
      <div className="xcap-visual xcap-visual--global xcap-magic-globe-demo bg-background relative flex size-full max-w-lg items-center justify-center overflow-hidden rounded-lg border px-40 pt-8 pb-40 md:pb-60">
        <span className="xcap-magic-globe-title pointer-events-none bg-linear-to-b from-black to-gray-300/80 bg-clip-text text-center text-8xl leading-none font-semibold whitespace-pre-wrap text-transparent dark:from-white dark:to-slate-900/10">
          Globe
        </span>
        <Globe className="top-28" />
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
        <div className="xcap-orbit-stage" aria-label="20 popular integrations orbiting Xroga">
          <OrbitRing items={INTEGRATIONS.slice(12, 20)} radius={106} duration={34} />
          <OrbitRing items={INTEGRATIONS.slice(5, 12)} radius={77} duration={27} reverse />
          <OrbitRing items={INTEGRATIONS.slice(0, 5)} radius={49} duration={19} />
          <div className="xcap-orbit-core"><strong>X</strong><b>XROGA</b><span>Custom MCP</span></div>
        </div>
        <div className="xcap-integration-pills"><span>20 shown</span><span>1,500+ plugins</span><span>Custom MCP</span></div>
      </div>
      <Copy eyebrow="ONE AI WORKSPACE" title="1,500+ ways to" muted="get work done." description="Connect business apps, developer tools, APIs and custom MCPs in one workspace." />
    </Card>
  );
}

function KnowledgeCard() {
  const [report, setReport] = useState(0);
  const reports = [['18 sources', 'Research complete'], ['6 files', 'Analysis complete'], ['1 report', 'Ready to review']] as const;
  useEffect(() => {
    const timer = window.setInterval(() => setReport((value) => (value + 1) % reports.length), 2400);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <Card className="xcap-card--knowledge">
      <div className="xcap-visual xcap-visual--knowledge" aria-hidden="true">
        <div className="xcap-doc xcap-doc--one"><span>PDF</span><b>brief.pdf</b><small>Market notes</small></div>
        <div className="xcap-doc xcap-doc--two"><span>XLS</span><b>pipeline.xlsx</b><small>418 rows</small></div>
        <div className="xcap-doc xcap-doc--three"><span>WEB</span><b>Live research</b><small>Current sources</small></div>
        <div className="xcap-scan"><i /><i /><b>Analyzing files + live sources</b></div>
        <div className="xcap-report" key={report}><span>✓</span><div><b>{reports[report][1]}</b><small>Notification + full report</small></div><strong>{reports[report][0]}</strong></div>
      </div>
      <Copy eyebrow="FILES · WEB · CHATS · RESEARCH" title="Bring the messy stuff." muted="Get clarity back." description="Read files, search current information, compare evidence and return a finished report." />
    </Card>
  );
}

function WorkingCard() {
  const [run, setRun] = useState(0);
  const current = RUNS[run % RUNS.length];
  useEffect(() => {
    const timer = window.setInterval(() => setRun((value) => value + 1), 9200);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <Card className="xcap-card--working">
      <div className="xcap-visual xcap-visual--working" key={run}>
        <div className="xcap-workspace">
          <div className="xcap-workspace-top"><span><i /> <i /> <i /></span><b>Xroga execution</b><small>live example</small></div>
          <div className="xcap-prompt"><span className="xcap-sphere" /><div><small>You asked Xroga</small><b>{current[0]}</b></div></div>
          <div className="xcap-steps">
            {current[1].map((step, index) => <p key={step} style={{ '--delay': `${index * 1.15}s` } as CSSProperties}><span>{index + 1}</span>{step}<i>{index === current[1].length - 1 ? '✓' : '→'}</i></p>)}
          </div>
        </div>
        <button type="button" onClick={() => setRun((value) => value + 1)}>✦ Run another example</button>
      </div>
      <Copy eyebrow="PROMPT → ACTION → VERIFIED OUTCOME" title="Tell Xroga what" muted="needs to happen." description="One request can trigger research, files, tools, approvals, execution and verification." />
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
