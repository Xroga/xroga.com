'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import '@/styles/homepage-capabilities.css';
import Image from 'next/image';
import { Globe } from '@/components/magicui/globe';
import { getIntegrationLogo } from '@/lib/integrationLogos';
import { SIDEBAR_LOGO_URL } from '@/lib/theme';

const INTEGRATIONS = [
  ['google-drive', 'Google Drive'], ['gmail', 'Gmail'], ['slack', 'Slack'], ['github', 'GitHub'],
  ['notion', 'Notion'], ['microsoftteams', 'Microsoft Teams'], ['hubspot', 'HubSpot'], ['stripe', 'Stripe'],
  ['shopify', 'Shopify'], ['vercel', 'Vercel'], ['supabase', 'Supabase'], ['airtable', 'Airtable'],
  ['dropbox', 'Dropbox'], ['trello', 'Trello'], ['discord', 'Discord'], ['jira', 'Jira'],
  ['asana', 'Asana'], ['figma', 'Figma'], ['zapier', 'Zapier'], ['canva', 'Canva'],
] as const;

const INTEGRATION_GROUPS = Array.from({ length: 5 }, (_, groupIndex) =>
  INTEGRATIONS.slice(groupIndex * 4, groupIndex * 4 + 4)
);

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

function IntegrationLogo({ id, label, size }: { id: string; label: string; size: 'sm' | 'md' }) {
  const logo = getIntegrationLogo(id);
  return (
    <span className={`xcap-tool-logo xcap-tool-logo--${size}`} title={label} aria-label={label}>
      {logo ? <img src={logo} alt={label} loading="lazy" /> : <b>{label.slice(0, 2).toUpperCase()}</b>}
    </span>
  );
}

function GlobalCard() {
  return (
    <Card className="xcap-card--global">
      <div className="xcap-visual xcap-visual--global xcap-magic-globe-demo bg-background relative flex size-full max-w-lg items-center justify-center overflow-hidden rounded-lg border px-40 pt-8 pb-40 md:pb-60">
        <span className="xcap-magic-globe-title pointer-events-none bg-linear-to-b from-black to-gray-300/80 bg-clip-text text-center text-8xl leading-none font-semibold whitespace-pre-wrap text-transparent dark:from-white dark:to-slate-900/10">
          Globe
        </span>
        <Globe className="xcap-globe-component top-28" />
        <div className="xcap-magic-globe-shade pointer-events-none absolute inset-0 h-full bg-[radial-gradient(circle_at_50%_200%,rgba(0,0,0,0.2),rgba(255,255,255,0))]" />
      </div>
      <Copy eyebrow="GLOBAL · MULTILINGUAL · VOICE" title="Work in your language." muted="Anywhere." description="Type or speak naturally. Xroga works in the language you already use." />
    </Card>
  );
}

function IntegrationsCard() {
  const [group, setGroup] = useState(0);
  const current = INTEGRATION_GROUPS[group % INTEGRATION_GROUPS.length];

  useEffect(() => {
    const timer = window.setInterval(() => setGroup((value) => value + 1), 2600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card className="xcap-card--integrations">
      <div className="xcap-visual xcap-visual--integrations">
        <div className="xcap-tool-stage" aria-label="20 popular Xroga integrations">
          <div className="xcap-tool-row" key={group}>
            <IntegrationLogo id={current[0][0]} label={current[0][1]} size="sm" />
            <IntegrationLogo id={current[1][0]} label={current[1][1]} size="md" />
            <span className="xcap-xroga-tool-logo" title="Xroga">
              <Image src={SIDEBAR_LOGO_URL} alt="Xroga" width={36} height={36} priority={false} />
            </span>
            <IntegrationLogo id={current[2][0]} label={current[2][1]} size="md" />
            <IntegrationLogo id={current[3][0]} label={current[3][1]} size="sm" />
          </div>
          <div className="xcap-tool-scanner" aria-hidden="true">
            <i />
            <span>
              {Array.from({ length: 12 }).map((_, index) => <b key={index} style={{ '--dust': index } as CSSProperties} />)}
            </span>
          </div>
        </div>
        <div className="xcap-integration-pills"><span>20 real apps</span><span>1,500+ plugins</span><span>Custom MCP</span></div>
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
