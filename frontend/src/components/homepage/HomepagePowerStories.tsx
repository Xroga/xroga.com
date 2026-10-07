'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  siDiscord,
  siDropbox,
  siFigma,
  siGithub,
  siGmail,
  siGooglecalendar,
  siGoogledrive,
  siHubspot,
  siNotion,
  siStripe,
  siVercel,
  type SimpleIcon,
} from 'simple-icons';
import {
  Bot,
  Boxes,
  Braces,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  Code2,
  FileCode2,
  FileText,
  Globe2,
  Image as ImageIcon,
  Laptop,
  Link2,
  MessageSquareText,
  Mic2,
  MonitorSmartphone,
  Network,
  Puzzle,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  TestTube2,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import '@/styles/homepage-power-stories.css';

type StoryProps = {
  index: number;
  eyebrow: string;
  title: ReactNode;
  copy: string;
  children: ReactNode;
  className?: string;
};

const INPUTS: Array<{ label: string; icon: LucideIcon; detail: string }> = [
  { label: 'Voice or text', icon: Mic2, detail: 'Speak naturally or describe the outcome in your own words.' },
  { label: 'Files & visuals', icon: ImageIcon, detail: 'Add PDFs, documents, screenshots, images, or design references.' },
  { label: 'Links & APIs', icon: Link2, detail: 'Share documentation, repositories, websites, videos, and API references.' },
  { label: 'No idea yet', icon: Sparkles, detail: 'Ask Xroga to generate and refine useful product ideas with you.' },
];

const CONNECT_APPS: Array<{ mark: SimpleIcon; position: string }> = [
  { mark: siGmail, position: 'app-1' },
  { mark: siGooglecalendar, position: 'app-2' },
  { mark: siGoogledrive, position: 'app-3' },
  { mark: siGithub, position: 'app-4' },
  { mark: siNotion, position: 'app-5' },
  { mark: siHubspot, position: 'app-6' },
  { mark: siStripe, position: 'app-7' },
  { mark: siFigma, position: 'app-8' },
  { mark: siDropbox, position: 'app-9' },
  { mark: siDiscord, position: 'app-10' },
];

const INPUT_EXAMPLES = [
  {
    prompt: 'What did we agree on last week?',
    brands: [siGmail, siNotion],
    status: 'Updating 3 sources',
    tasks: ['Summary email drafted', '2 follow-ups opened', 'Meeting notes updated'],
  },
  {
    prompt: 'Turn these references into a product plan',
    brands: [siFigma, siGithub],
    status: 'Building from your context',
    tasks: ['Design system mapped', 'Build plan created', 'Review checklist ready'],
  },
  {
    prompt: 'Fix checkout and verify the deployment',
    brands: [siGithub, siVercel],
    status: 'Running the workflow',
    tasks: ['Issue reproduced', 'Patch and tests completed', 'Preview deployment ready'],
  },
  {
    prompt: 'Find our best leads and prepare outreach',
    brands: [siHubspot, siGmail],
    status: 'Preparing the handoff',
    tasks: ['12 leads enriched', 'Personalized drafts created', 'Approval report ready'],
  },
];

function BrandMark({ mark }: { mark: SimpleIcon }) {
  return (
    <svg viewBox="0 0 24 24" aria-label={mark.title} role="img" style={{ color: `#${mark.hex}` }}>
      <path fill="currentColor" d={mark.path} />
    </svg>
  );
}

const RESEARCH_SCENES = [
  { query: 'Compare our launch against the strongest competitors', sources: ['Public web', 'Competitor sites', 'Product docs'], result: 'Cited opportunity report' },
  { query: 'Read this API and plan the safest integration', sources: ['API reference', 'Repository', 'Security notes'], result: 'Implementation brief' },
  { query: 'Turn this video and PDF into an executive summary', sources: ['Video transcript', 'PDF evidence', 'Linked sources'], result: 'Grounded summary' },
];

const DEVICES = [
  { label: 'Web', icon: Globe2, screen: 'Responsive SaaS dashboard', detail: 'Desktop, tablet, and mobile web' },
  { label: 'Mobile', icon: Smartphone, screen: 'Native app flow', detail: 'Android and iOS-ready projects' },
  { label: 'Desktop', icon: Laptop, screen: 'Desktop command center', detail: 'Windows, macOS, and Linux' },
  { label: 'Extensions', icon: Puzzle, screen: 'Browser side panel', detail: 'Chrome extension experiences' },
];

const EMPLOYEES = ['Developer', 'Designer', 'Researcher', 'Analyst', 'QA', 'DevOps', 'Browser', 'Workflow', 'Support'];

const AUTOMATION_STEPS = [
  { label: 'Connect', title: 'Bring your tools', detail: '1,500+ apps, APIs, and custom MCP connections.', icon: Boxes },
  { label: 'Ask', title: 'Describe the outcome', detail: 'Xroga selects the useful tools and a safe workflow.', icon: MessageSquareText },
  { label: 'Automate', title: 'Approve the result', detail: 'Repeatable work runs with evidence and required approvals.', icon: Workflow },
];

const SHIPPING_STEPS = [
  { label: 'Build', icon: Code2, detail: 'Implement the requested product' },
  { label: 'Test', icon: TestTube2, detail: 'Run code and browser checks' },
  { label: 'Review', icon: ShieldCheck, detail: 'Inspect evidence and approvals' },
  { label: 'Ship', icon: Cloud, detail: 'Publish through accounts you control' },
];

function StorySection({ index, eyebrow, title, copy, children, className = '' }: StoryProps) {
  return (
    <section className={`xps-story ${className}`} aria-labelledby={`xps-title-${index}`}>
      <div className="xps-story__copy">
        <span className="xps-story__number">0{index}</span>
        <p className="xps-story__eyebrow">{eyebrow}</p>
        <h2 id={`xps-title-${index}`}>{title}</h2>
        <p>{copy}</p>
      </div>
      <div className="xps-story__stage">{children}</div>
    </section>
  );
}

function ProgressDots({ count, active, label }: { count: number; active: number; label: string }) {
  return (
    <div className="xps-progress" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <span className={index === active ? 'is-active' : ''} key={index} aria-hidden="true" />
      ))}
    </div>
  );
}

export function HomepagePowerStories() {
  const suiteRef = useRef<HTMLDivElement>(null);
  const [inputIndex, setInputIndex] = useState(0);
  const [researchIndex, setResearchIndex] = useState(0);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [automationIndex, setAutomationIndex] = useState(0);
  const [shippingIndex, setShippingIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setInputIndex((value) => (value + 1) % INPUTS.length);
      setResearchIndex((value) => (value + 1) % RESEARCH_SCENES.length);
      setDeviceIndex((value) => (value + 1) % DEVICES.length);
      setAutomationIndex((value) => (value + 1) % AUTOMATION_STEPS.length);
      setShippingIndex((value) => (value + 1) % SHIPPING_STEPS.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const suite = suiteRef.current;
    if (!suite || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const stories = Array.from(suite.querySelectorAll<HTMLElement>('.xps-story'));
    suite.classList.add('xps-motion-ready');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    );

    stories.forEach((story) => observer.observe(story));
    return () => observer.disconnect();
  }, []);

  const activeInput = INPUTS[inputIndex];
  const ActiveInputIcon = activeInput.icon;
  const inputExample = INPUT_EXAMPLES[inputIndex];
  const research = RESEARCH_SCENES[researchIndex];
  const device = DEVICES[deviceIndex];
  const ActiveDeviceIcon = device.icon;
  const automation = AUTOMATION_STEPS[automationIndex];
  const ActiveAutomationIcon = automation.icon;

  return (
    <div ref={suiteRef} className="xps-suite" aria-label="Explore everything Xroga can do">
      <header className="xps-suite__intro">
        <p>ONE AI WORKSPACE · SIX CONNECTED SYSTEMS</p>
        <h2 aria-label="Connect your tools, ask in plain words, and hand off the busywork">
          <span className={automationIndex === 0 ? 'is-active' : ''}>Connect the tools you already use <sup>01</sup></span>
          <span className={automationIndex === 1 ? 'is-active' : ''}>Ask anything in plain words <sup>02</sup></span>
          <span className={automationIndex === 2 ? 'is-active' : ''}>Hand off the busywork <sup>03</sup></span>
        </h2>
        <span>From an idea, file, link, or existing repository to tested work you can inspect and own.</span>
      </header>

      <section className="xps-story xps-story--inputs" aria-labelledby="xps-title-1">
        <div className="xps-story__copy">
          <span className="xps-story__number">01</span>
          <div>
            <p className="xps-story__eyebrow">START WITH ANYTHING</p>
            <h2 id="xps-title-1">Bring the context. <em>Xroga finds the path.</em></h2>
            <p>Type, speak, upload, paste, or point Xroga at the source. Your request and evidence stay together in one workspace.</p>
          </div>
        </div>
        <div className="xps-story__stage">
        <div className="xps-input-demo">
          <article className="xps-input-demo__card xps-input-demo__connect">
            <div className="xps-input-demo__visual" aria-label="Connected business and developer apps">
              {CONNECT_APPS.map((app) => (
                <span className={app.position} key={app.mark.title}><BrandMark mark={app.mark} /></span>
              ))}
              <div className="xps-input-demo__mic" aria-hidden="true">
                <Mic2 />
                <i /><i /><i /><i />
              </div>
            </div>
            <div className="xps-input-demo__caption"><small>01</small><strong>Connect</strong><p>Bring your apps, files, voice, links, and existing work into one request.</p><i /></div>
          </article>

          <article className="xps-input-demo__card xps-input-demo__ask" key={`ask-${inputExample.prompt}`}>
            <div className="xps-input-demo__visual">
              <div className="xps-input-demo__chatbar">
                <span>{inputExample.prompt}</span>
                <button type="button" aria-label="Send example prompt"><ActiveInputIcon /></button>
              </div>
            </div>
            <div className="xps-input-demo__caption"><small>02</small><strong>Ask</strong><p>Ask in plain words. Xroga understands the outcome and selects the useful context.</p><i /></div>
          </article>

          <article className="xps-input-demo__card xps-input-demo__result" key={`result-${inputExample.status}`}>
            <div className="xps-input-demo__visual">
              <div className="xps-input-demo__status">
                <span><Workflow /> {inputExample.status}</span>
                <div>{inputExample.brands.map((mark) => <BrandMark mark={mark} key={mark.title} />)}</div>
              </div>
              <div className="xps-input-demo__checks">
                {inputExample.tasks.map((task, index) => <p style={{ '--xps-delay': `${index * 100}ms` } as CSSProperties} key={task}>{task}<Check aria-hidden="true" /></p>)}
              </div>
            </div>
            <div className="xps-input-demo__caption"><small>03</small><strong>Automate</strong><p>See changing workflow outputs, completed actions, evidence, and approvals.</p><i /></div>
          </article>
        </div>
        <div className="xps-selector" role="tablist" aria-label="Ways to start with Xroga">
          {INPUTS.map((item, index) => (
            <button type="button" role="tab" aria-selected={inputIndex === index} onClick={() => setInputIndex(index)} key={item.label}>{item.label}</button>
          ))}
        </div>
        </div>
      </section>

      <StorySection
        index={2}
        eyebrow="RESEARCH WITH RECEIPTS"
        title={<>Search broadly.<br /><em>Answer precisely.</em></>}
        copy="Research the web, X, documentation, competitors, APIs, repositories, PDFs, and video transcripts—then receive a concise result with traceable sources."
        className="xps-story--research"
      >
        <div className="xps-research-demo" key={research.query}>
          <div className="xps-research-demo__query"><Search aria-hidden="true" /><span>{research.query}</span><kbd>↵</kbd></div>
          <div className="xps-research-demo__flow">
            {research.sources.map((source, index) => (
              <div style={{ '--xps-delay': `${index * 140}ms` } as CSSProperties} key={source}><Globe2 aria-hidden="true" /><span>{source}</span><i /></div>
            ))}
          </div>
          <div className="xps-research-demo__report"><FileText aria-hidden="true" /><div><small>FINISHED OUTPUT</small><strong>{research.result}</strong><span>12 sources · checked moments ago</span></div><CheckCircle2 aria-hidden="true" /></div>
          <ProgressDots count={RESEARCH_SCENES.length} active={researchIndex} label="Research example progress" />
        </div>
      </StorySection>

      <StorySection
        index={3}
        eyebrow="BUILD FOR EVERY SCREEN"
        title={<>One workspace.<br /><em>Every product surface.</em></>}
        copy="Start fresh or continue from an existing GitHub repository. Build websites, mobile apps, desktop software, extensions, APIs, CLIs, and internal tools."
        className="xps-story--devices"
      >
        <div className="xps-device-demo">
          <div className="xps-device-demo__rail" role="tablist" aria-label="Products Xroga can build">
            {DEVICES.map((item, index) => {
              const Icon = item.icon;
              return <button type="button" role="tab" aria-selected={deviceIndex === index} onClick={() => setDeviceIndex(index)} key={item.label}><Icon /><span>{item.label}</span></button>;
            })}
          </div>
          <div className="xps-device-demo__canvas" key={device.label}>
            <div className="xps-device-demo__signal"><i /><i /><i /></div>
            <div className="xps-device-demo__screen"><ActiveDeviceIcon aria-hidden="true" /><small>BUILD TARGET</small><strong>{device.screen}</strong><span>{device.detail}</span><div><Check /> Responsive preview ready</div></div>
            <div className="xps-device-demo__mini"><Smartphone /><Tablet /><Laptop /></div>
          </div>
        </div>
      </StorySection>

      <StorySection
        index={4}
        eyebrow="A TEAM BEHIND ONE REQUEST"
        title={<>You set the goal.<br /><em>Xroga manages the work.</em></>}
        copy="A manager routes each task to focused AI employees while policy and budget controls feed the same evidence-owning runtime."
        className="xps-story--agents"
      >
        <div className="xps-agent-map">
          <div className="xps-agent-map__intent"><small>USER INTENT</small><strong>“Build this” · “Do this” · “Fix this”</strong></div>
          <div className="xps-agent-map__manager"><Bot /><span><small>XROGA MANAGER</small><strong>Plan · route · supervise</strong></span><i /></div>
          <div className="xps-agent-map__employees" aria-label="Available AI employee roles">
            {EMPLOYEES.map((employee, index) => <span style={{ '--employee-delay': `${index * 80}ms` } as CSSProperties} key={employee}>{employee}</span>)}
          </div>
          <div className="xps-agent-map__bus"><Network /><span>AGENT BUS</span><i>ACP</i><i>MCP</i><i>Skills</i></div>
          <div className="xps-agent-map__runtime"><Braces /><span>task graph → sandbox → evidence → tests → browser → review → repair → approval → commit</span></div>
        </div>
      </StorySection>

      <StorySection
        index={5}
        eyebrow="CONNECT · AUTOMATE · GROW"
        title={<>Hand off the busywork.<br /><em>Keep the control.</em></>}
        copy="Install plugin packs, connect custom MCPs, or describe a workflow. Automate research, outreach, meetings, publishing, SEO, AEO, GEO, and recurring operations."
        className="xps-story--automate"
      >
        <div className="xps-automation-demo">
          <div className="xps-automation-demo__panels" role="tablist" aria-label="Connected automation stages">
            {AUTOMATION_STEPS.map((step, index) => (
              <button type="button" role="tab" aria-selected={automationIndex === index} onClick={() => setAutomationIndex(index)} key={step.label}>
                <span className="xps-automation-demo__visual">
                  <step.icon />
                  {index === 0 ? <i className="xps-tool-cloud"><b>Mail</b><b>CRM</b><b>Docs</b><b>Git</b><b>SEO</b></i> : null}
                  {index === 1 ? <i className="xps-ask-line">Ask anything… <Send /></i> : null}
                  {index === 2 ? <i className="xps-task-list"><b>3 sources updated</b><b>Summary drafted ✓</b><b>Report ready ✓</b></i> : null}
                </span>
                <span className="xps-automation-demo__label"><small>0{index + 1}</small><strong>{step.label}</strong><em>{step.detail}</em><i /></span>
              </button>
            ))}
          </div>
          <div className="xps-growth-strip" key={automation.label}><ActiveAutomationIcon /><strong>{automation.title}</strong><span>{automation.detail}</span><Search /><span>Research</span><FileCode2 /><span>Publish</span><CircleDollarSign /><span>Grow</span></div>
        </div>
      </StorySection>

      <StorySection
        index={6}
        eyebrow="VERIFY, THEN SHIP"
        title={<>Production is a process.<br /><em>Xroga shows the proof.</em></>}
        copy="Preview, test, review, repair, approve, and publish through infrastructure you control—including domains, payments, integrations, and supported app-store delivery."
        className="xps-story--ship"
      >
        <div className="xps-ship-demo">
          <div className="xps-ship-demo__pipeline">
            {SHIPPING_STEPS.map((step, index) => {
              const Icon = step.icon;
              const complete = index <= shippingIndex;
              return (
                <button type="button" className={complete ? 'is-complete' : ''} onClick={() => setShippingIndex(index)} key={step.label} aria-label={`Show ${step.label} stage`}>
                  <span><Icon /></span><strong>{step.label}</strong><small>{step.detail}</small><i />
                </button>
              );
            })}
          </div>
          <div className="xps-ship-demo__receipt" key={shippingIndex}>
            <span><i /> RELEASE EVIDENCE</span>
            <strong>{SHIPPING_STEPS[shippingIndex].label} stage verified</strong>
            <p><Check /> Files and command results recorded</p>
            <p><Check /> Runtime state checked independently</p>
            <p><Check /> User approval required where sensitive</p>
            <div><MonitorSmartphone /> Web · mobile · desktop · extensions</div>
          </div>
          <ProgressDots count={SHIPPING_STEPS.length} active={shippingIndex} label="Shipping stage progress" />
        </div>
      </StorySection>

      <footer className="xps-suite__footer">
        <div><Wrench /><span><strong>Start with an idea—or a real repository.</strong> Xroga keeps the work, evidence, and delivery in one place.</span></div>
        <Link href="/workspace">Explore the workspace <span aria-hidden="true">→</span></Link>
      </footer>
    </div>
  );
}
