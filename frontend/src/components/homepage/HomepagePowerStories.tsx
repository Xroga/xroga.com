'use client';

import type { CSSProperties, FormEvent, ReactNode } from 'react';
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
  title: ReactNode;
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

const AGENT_GROUPS = [
  { label: 'Product build', roles: ['Developer', 'Designer', 'QA'] },
  { label: 'Knowledge work', roles: ['Researcher', 'Analyst', 'Support'] },
  { label: 'Operations', roles: ['Browser', 'Workflow', 'DevOps'] },
];

const AUTOMATION_CARDS = [
  { kicker: '01 · RESEARCH', title: 'Account brief ready', detail: '14 sources checked · citations attached' },
  { kicker: '02 · OUTREACH', title: 'Personalized drafts prepared', detail: '12 contacts · approval required' },
  { kicker: '03 · REPORT', title: 'Weekly operations digest', detail: '7 workflows · all systems healthy' },
];

const CODE_TABS = [
  {
    label: 'app.tsx',
    lines: [
      <><span className="xps-code-keyword">export function</span> <span className="xps-code-name">Workspace</span>() {'{'}</>,
      <>&nbsp;&nbsp;<span className="xps-code-keyword">return</span> &lt;<span className="xps-code-name">Build</span> verified /&gt;;</>,
      <> {'}'}</>,
    ],
  },
  {
    label: 'workflow.ts',
    lines: [
      <><span className="xps-code-keyword">const</span> release = <span className="xps-code-name">await</span> verify({'{'}</>,
      <>&nbsp;&nbsp;tests: <span className="xps-code-string">&apos;passed&apos;</span>,</>,
      <>&nbsp;&nbsp;approval: <span className="xps-code-string">&apos;required&apos;</span>,</>,
      <> {'}'});</>,
    ],
  },
  {
    label: 'release.spec.ts',
    lines: [
      <><span className="xps-code-name">test</span>(<span className="xps-code-string">&apos;ships with proof&apos;</span>, () =&gt; {'{'}</>,
      <>&nbsp;&nbsp;expect(receipt.status).toBe(<span className="xps-code-string">&apos;ready&apos;</span>);</>,
      <> {'}'});</>,
    ],
  },
];

function StatusMark({ label, complete = false }: { label: string; complete?: boolean }) {
  return (
    <span className={`xps-status-mark ${complete ? 'is-complete' : ''}`}>
      <i aria-hidden="true">{complete ? <Check /> : null}</i>
      <span>{label}</span>
    </span>
  );
}

function LatticeStatus({ label }: { label: string }) {
  return (
    <span className="xps-lattice-status" role="status">
      <i aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <b key={index} />)}</i>
      <span>{label}</span>
      <time>2.4s</time>
    </span>
  );
}

function CompareSurface() {
  const handleInput = (event: FormEvent<HTMLInputElement>) => {
    event.currentTarget.parentElement?.style.setProperty('--xps-compare', `${event.currentTarget.value}%`);
  };

  return (
    <div className="xps-compare-surface" style={{ '--xps-compare': '58%' } as CSSProperties}>
      <div className="xps-compare-surface__before">
        <small>RAW INPUT</small>
        <span>52 pages</span><span>9 open questions</span><span>Unsorted evidence</span>
      </div>
      <div className="xps-compare-surface__after">
        <small>GROUNDED RESULT</small>
        <StatusMark label="Sources reconciled" complete />
        <StatusMark label="Claims cited" complete />
        <StatusMark label="Decision brief ready" complete />
      </div>
      <input type="range" min="20" max="80" defaultValue="58" onInput={handleInput} aria-label="Compare raw research with the grounded result" />
      <i aria-hidden="true" />
    </div>
  );
}

function StorySection({ index, title, children, className = '' }: StoryProps) {
  return (
    <section className={`xps-story ${className}`} aria-labelledby={`xps-title-${index}`}>
      <header className="xps-story__heading">
        <span className="xps-story__number">0{index}</span>
        <h2 id={`xps-title-${index}`}>{title}</h2>
      </header>
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
  const [inputIndex, setInputIndex] = useState(2);
  const [researchIndex, setResearchIndex] = useState(2);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [automationIndex, setAutomationIndex] = useState(0);
  const [shippingIndex, setShippingIndex] = useState(0);
  const [codeTab, setCodeTab] = useState(0);

  useEffect(() => {
    const suite = suiteRef.current;
    if (!suite || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const stories = Array.from(suite.querySelectorAll<HTMLElement>('.xps-story'));
    let suiteInView = false;
    let timer = 0;
    suite.classList.add('xps-motion-ready');

    const stopTimer = () => {
      if (!timer) return;
      window.clearInterval(timer);
      timer = 0;
    };

    const startTimer = () => {
      if (timer || !suiteInView || document.hidden) return;
      timer = window.setInterval(() => {
        setInputIndex((value) => (value + 1) % INPUTS.length);
        setResearchIndex((value) => (value + 1) % RESEARCH_SCENES.length);
        setDeviceIndex((value) => (value + 1) % DEVICES.length);
        setAutomationIndex((value) => (value + 1) % AUTOMATION_STEPS.length);
        setShippingIndex((value) => (value + 1) % SHIPPING_STEPS.length);
      }, 5200);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === suite) {
            suiteInView = entry.isIntersecting;
            if (suiteInView) startTimer();
            else stopTimer();
            return;
          }

          entry.target.classList.toggle('is-inview', entry.isIntersecting);
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
      },
      { threshold: 0.08, rootMargin: '12% 0px 12% 0px' },
    );

    const handleVisibility = () => {
      if (document.hidden) stopTimer();
      else startTimer();
    };

    observer.observe(suite);
    stories.forEach((story) => observer.observe(story));
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopTimer();
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
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
    <section className="xps-band" aria-label="Explore everything Xroga can do">
    <div ref={suiteRef} className="xps-suite">
      <section className="xps-story xps-story--inputs" aria-labelledby="xps-title-1">
        <div className="xps-story__stage">
        <div className="xps-mini-browser xps-pixel-surface">
          <header className="xps-mini-browser__headline">
            <p>ONE AI WORKSPACE · SIX CONNECTED SYSTEMS</p>
            <h2 id="xps-title-1" aria-label="Connect your tools, ask in plain words, and hand off the busywork">
              <span className={automationIndex === 0 ? 'is-active' : ''}>Connect the tools you already use <sup>01</sup></span>
              <span className={automationIndex === 1 ? 'is-active' : ''}>Ask anything in plain words <sup>02</sup></span>
              <span className={automationIndex === 2 ? 'is-active' : ''}>Hand off the busywork <sup>03</sup></span>
            </h2>
          </header>
          <div className="xps-mini-browser__tabs" aria-hidden="true">
            <span className="is-active"><i /> Xroga workspace</span>
            <span><i /> Connected tools</span>
            <b>+</b>
            <em><i /><i /><i /></em>
          </div>
          <div className="xps-mini-browser__url" aria-hidden="true"><span>https://xroga.com/workspace</span></div>
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
        title={<>Search broadly.<br /><em>Answer precisely.</em></>}
        className="xps-story--research"
      >
        <div className="xps-research-demo xps-pixel-surface" key={research.query}>
          <div className="xps-research-demo__thinking">
            <LatticeStatus label="Thinking across sources" />
            <span>Evidence trace open <i aria-hidden="true">⌄</i></span>
          </div>
          <div className="xps-research-demo__query"><Search aria-hidden="true" /><span>{research.query}</span><kbd>↵</kbd></div>
          <div className="xps-research-demo__flow">
            {research.sources.map((source, index) => (
              <div style={{ '--xps-delay': `${index * 140}ms` } as CSSProperties} key={source}><Globe2 aria-hidden="true" /><span>{source}</span><i /></div>
            ))}
          </div>
          <CompareSurface />
          <div className="xps-research-demo__report"><FileText aria-hidden="true" /><div><small>FINISHED OUTPUT</small><strong>{research.result}</strong><span>12 sources · checked moments ago</span></div><CheckCircle2 aria-hidden="true" /></div>
          <ProgressDots count={RESEARCH_SCENES.length} active={researchIndex} label="Research example progress" />
        </div>
      </StorySection>

      <StorySection
        index={3}
        title={<>Build for every screen.<br /><em>One responsive workspace.</em></>}
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
            <div className={`xps-device-shell is-${device.label.toLowerCase()}`}>
              <div className="xps-device-shell__lid">
                <div className="xps-device-shell__chrome" aria-hidden="true"><i /><i /><i /><span>xroga://preview</span></div>
                <div className="xps-device-demo__screen">
                  <ActiveDeviceIcon aria-hidden="true" />
                  <small>BUILD TARGET</small>
                  <strong>{device.screen}</strong>
                  <span>{device.detail}</span>
                  <div><Check /> Responsive preview ready</div>
                </div>
              </div>
              <div className="xps-device-shell__base" aria-hidden="true" />
              <i className="xps-device-shell__notch" aria-hidden="true" />
              <i className="xps-device-shell__button" aria-hidden="true" />
            </div>
            <div className="xps-device-demo__mini"><Smartphone /><Tablet /><Laptop /></div>
          </div>
        </div>
      </StorySection>

      <StorySection
        index={4}
        title={<>One goal.<br /><em>A managed AI team.</em></>}
        className="xps-story--agents"
      >
        <div className="xps-agent-map xps-pixel-surface">
          <div className="xps-agent-map__intent"><small>USER INTENT</small><strong>“Build this” · “Do this” · “Fix this”</strong></div>
          <div className="xps-agent-map__manager"><Bot /><span><small>XROGA MANAGER</small><strong>Plan · route · supervise</strong></span><LatticeStatus label="Routing" /><i /></div>
          <div className="xps-branch-menu" aria-label="Available AI employee roles">
            {AGENT_GROUPS.map((group, groupIndex) => (
              <div className="xps-branch-menu__group" key={group.label}>
                <strong><i />{group.label}</strong>
                <div>
                  {group.roles.map((role, roleIndex) => (
                    <span className={groupIndex === 0 && roleIndex === 0 ? 'is-active' : ''} key={role}>
                      <i aria-hidden="true" />{role}<small>{roleIndex === 0 ? 'active' : 'ready'}</small>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="xps-agent-map__bus"><Network /><span>AGENT BUS</span><i>ACP</i><i>MCP</i><i>Skills</i></div>
          <div className="xps-agent-map__runtime"><Braces /><span>task graph → sandbox → evidence → tests → browser → review → repair → approval → commit</span></div>
        </div>
      </StorySection>

      <StorySection
        index={5}
        title={<>Hand off the busywork.<br /><em>Keep the control.</em></>}
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
          <div className="xps-automation-premium">
            <div className="xps-radio-island" role="radiogroup" aria-label="Automation schedule">
              <input type="radio" name="xps-cadence" id="xps-now" defaultChecked />
              <input type="radio" name="xps-cadence" id="xps-day" />
              <input type="radio" name="xps-cadence" id="xps-week" />
              <span aria-hidden="true" />
              <label htmlFor="xps-now">Now</label>
              <label htmlFor="xps-day">Daily</label>
              <label htmlFor="xps-week">Weekly</label>
            </div>
            <div className="xps-card-swap" aria-label="Live automation outputs">
              {AUTOMATION_CARDS.map((card, index) => (
                <article className="xps-automation-card" style={{ '--xps-card-index': index } as CSSProperties} key={card.kicker}>
                  <small>{card.kicker}</small>
                  <strong>{card.title}</strong>
                  <span>{card.detail}</span>
                  <StatusMark label={index === 0 ? 'Working' : 'Queued'} complete={index === 2} />
                </article>
              ))}
            </div>
          </div>
          <div className="xps-growth-strip" key={automation.label}><ActiveAutomationIcon /><strong>{automation.title}</strong><span>{automation.detail}</span><Search /><span>Research</span><FileCode2 /><span>Publish</span><CircleDollarSign /><span>Grow</span></div>
        </div>
      </StorySection>

      <StorySection
        index={6}
        title={<>Verify. Review.<br /><em>Then ship.</em></>}
        className="xps-story--ship"
      >
        <div className="xps-ship-demo">
          <div className="xps-code-window">
            <div className="xps-code-window__titlebar">
              <span><i /><i /><i /></span>
              <strong>xroga · release workspace</strong>
              <small>verified</small>
            </div>
            <div className="xps-code-window__tabs" role="tablist" aria-label="Release workspace files">
              {CODE_TABS.map((tab, index) => (
                <button type="button" role="tab" aria-selected={codeTab === index} onClick={() => setCodeTab(index)} key={tab.label}>{tab.label}</button>
              ))}
            </div>
            <pre className="xps-code-window__panel" aria-live="polite">
              {CODE_TABS[codeTab].lines.map((line, index) => <code key={index}><i>{index + 1}</i>{line}</code>)}
            </pre>
          </div>
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
        <Link className="xps-repo-button" href="/workspace"><BrandMark mark={siGithub} /><span>Build from GitHub</span><b>→</b></Link>
      </footer>
    </div>
    </section>
  );
}
