'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import '@/styles/homepage-capabilities.css';
import Image from 'next/image';
import { Globe } from '@/components/magicui/globe';
import { getIntegrationLogo } from '@/lib/integrationLogos';
import { SIDEBAR_LOGO_URL } from '@/lib/theme';

const INTEGRATIONS = [
  ['google-drive', 'Google Drive'], ['gmail', 'Gmail'], ['google-calendar', 'Google Calendar'], ['slack', 'Slack'], ['github', 'GitHub'],
  ['gitlab', 'GitLab'], ['notion', 'Notion'], ['hubspot', 'HubSpot'], ['stripe', 'Stripe'], ['shopify', 'Shopify'],
  ['vercel', 'Vercel'], ['supabase', 'Supabase'], ['airtable', 'Airtable'], ['dropbox', 'Dropbox'], ['discord', 'Discord'],
  ['jira', 'Jira'], ['asana', 'Asana'], ['trello', 'Trello'], ['figma', 'Figma'], ['canva', 'Canva'],
  ['cloudflare', 'Cloudflare'], ['netlify', 'Netlify'], ['openai', 'OpenAI'], ['anthropic', 'Anthropic'], ['paypal', 'PayPal'],
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
        <div className="xcap-integration-cloud" aria-label="25 popular Xroga integrations">
          <div className="xcap-integration-grid">
            {INTEGRATIONS.map(([id, label], index) => (
              <span
                className="xcap-integration-cell"
                key={id}
                style={{ '--logo-index': index } as CSSProperties}
              >
                <IntegrationLogo id={id} label={label} size={index % 6 === 0 ? 'md' : 'sm'} />
              </span>
            ))}
          </div>
          <span className="xcap-xroga-cloud-logo" title="Xroga">
            <Image src={SIDEBAR_LOGO_URL} alt="Xroga" width={32} height={32} priority={false} />
          </span>
          <div className="xcap-tool-scanner" aria-hidden="true">
            <i />
            <span>
              {Array.from({ length: 12 }).map((_, index) => <b key={index} style={{ '--dust': index } as CSSProperties} />)}
            </span>
          </div>
        </div>
        <div className="xcap-integration-pills"><span>1,500+ plugins</span><span>Custom MCP</span></div>
      </div>
      <Copy eyebrow="ONE AI WORKSPACE" title="1,500+ ways to" muted="get work done." description="Connect business apps, developer tools, APIs and custom MCPs in one workspace." />
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
            : 'white';
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
                : 'white';
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
