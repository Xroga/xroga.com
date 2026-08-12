'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDot,
  FileCode2,
  Folder,
  KeyRound,
  LockKeyhole,
  Search,
  ShieldCheck,
  TestTube2,
} from 'lucide-react';

const ACTIVITY = [
  { label: 'Creating authentication', state: 'done' },
  { label: 'Setting up database', state: 'done' },
  { label: 'Adding billing', state: 'active' },
  { label: 'Running tests', state: 'queued' },
] as const;

const REPOSITORY_FILES = [
  { name: 'app', type: 'folder' },
  { name: 'components', type: 'folder' },
  { name: 'lib', type: 'folder' },
  { name: 'tests', type: 'folder' },
  { name: '.env.example', type: 'file' },
  { name: 'README.md', type: 'file' },
] as const;

const LIVE_STATES = [
  { label: 'Research', detail: 'Reading current documentation', Icon: Search, tone: 'blue' },
  { label: 'Iterate', detail: 'Patch prepared · Tests 14/14', Icon: TestTube2, tone: 'green' },
  { label: 'Security', detail: 'Secrets encrypted · Customer credentials', Icon: ShieldCheck, tone: 'green' },
  { label: 'Control', detail: 'Awaiting authorization before publish', Icon: KeyRound, tone: 'amber' },
] as const;

const LOOP_PHASES = ['Understand', 'Build', 'Validate', 'Deploy', 'Observe', 'Improve'] as const;
const TIMELINE = ['Plan', 'Build', 'Validate', 'Deploy', 'Operate', 'Evolve'] as const;

function ProviderLogo({ name }: { name: 'github' | 'vercel' }) {
  return (
    <Image
      src={`/brand/logos/${name}.svg`}
      width={20}
      height={20}
      alt={`${name === 'github' ? 'GitHub' : 'Vercel'} logo`}
      className={`xv-se-provider xv-se-provider--${name}`}
    />
  );
}

export function HomepageShipStack() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.14 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`xv-se-section${isActive ? ' is-active' : ''}`}
      aria-labelledby="ship-heading"
    >
      <div className="xv-se-grid" aria-hidden="true" />
      <div className="xv-se-inner">
        <div className="xv-se-topline">
          <p className="xv-se-kicker"><i /> SHIP STACK</p>
          <span className="xv-se-loop-note"><i /> 6 steps. One loop. You own it.</span>
        </div>

        <header className="xv-se-heading">
          <h2 id="ship-heading">
            From prompt to <span><em>production</em> ownership<i>.</i></span>
          </h2>
          <p>
            Xroga helps you own the code and where it runs. We wire your GitHub, deploy on Vercel,
            and keep everything continuously updated — in your control.
          </p>
        </header>

        <div className="xv-se-system" aria-label="The Xroga ownership engine connected product loop">
          <svg className="xv-se-connections" viewBox="0 0 1200 850" preserveAspectRatio="none" aria-hidden="true">
            <path className="xv-se-path" d="M288 164 H374" />
            <path className="xv-se-path" d="M610 326 V370 C610 398 560 408 510 418 L385 450" />
            <path className="xv-se-path" d="M390 555 H486" />
            <path className="xv-se-path" d="M755 560 H898" />
            <path className="xv-se-path" d="M1012 658 V724 H943" />
            <path className="xv-se-path xv-se-path--loop" d="M958 769 H1123 V246 C1123 190 1076 161 1017 161 H827" />
            <circle className="xv-se-signal xv-se-signal--one" r="4" cx="0" cy="0" />
            <circle className="xv-se-signal xv-se-signal--two" r="4" cx="0" cy="0" />
          </svg>

          <form className="xv-se-prompt" onSubmit={(event) => event.preventDefault()} aria-label="Example Xroga prompt">
            <div className="xv-se-surface-label"><CircleDot /> IDEA INPUT <span>01</span></div>
            <label htmlFor="xroga-engine-prompt">What should Xroga build?</label>
            <div id="xroga-engine-prompt" role="textbox" aria-readonly="true" className="xv-se-prompt-copy">
              Build a customer analytics platform with authentication, subscriptions, analytics and admin controls.
            </div>
            <div className="xv-se-prompt-foot">
              <span><i /> Idea captured</span>
              <button type="submit" aria-label="Build example product">Build <ChevronRight /></button>
            </div>
          </form>

          <article className="xv-se-engine" aria-label="Xroga Engine building a customer analytics platform">
            <header>
              <span className="xv-se-engine-brand">
                <Image src="/brand/xroga-mark.png" width={32} height={32} alt="Xroga" />
                <span><b>XROGA ENGINE</b><small>CONNECTED PRODUCT LOOP</small></span>
              </span>
              <span className="xv-se-engine-status"><i /> <b>BUILDING</b></span>
            </header>
            <div className="xv-se-engine-task">
              <small>CURRENT TASK</small>
              <h3>Build customer analytics platform</h3>
              <span>Runtime 06 · Customer-owned workspace</span>
            </div>
            <ol className="xv-se-activity">
              {ACTIVITY.map((item, index) => (
                <li key={item.label} className={`is-${item.state}`}>
                  <span>{item.state === 'done' ? <Check /> : index + 1}</span>
                  <b>{item.label}</b>
                  <small>{item.state === 'done' ? 'Complete' : item.state === 'active' ? 'In progress' : 'Queued'}</small>
                </li>
              ))}
            </ol>
            <footer>
              <span className="xv-se-stream"><i /><i /><i /><i /><i /><i /><i /></span>
              <span className="xv-se-engine-phase"><b>VALIDATING</b><small>policy · tests · ownership</small></span>
              <strong>68%</strong>
            </footer>
          </article>

          <article className="xv-se-repo" aria-label="Customer-owned GitHub repository">
            <header>
              <span><ProviderLogo name="github" /><b>github / xroga / client-product</b></span>
              <small>PRIVATE <LockKeyhole /></small>
            </header>
            <div className="xv-se-repo-state"><i /><span><b>GITHUB CONNECTED</b><small>Repository belongs to customer</small></span><Check /></div>
            <ul>
              {REPOSITORY_FILES.map((file) => (
                <li key={file.name}>
                  {file.type === 'folder' ? <Folder /> : <FileCode2 />}
                  <span>{file.name}</span><ChevronRight />
                </li>
              ))}
            </ul>
            <footer>
              <Image src="/brand/xroga-mark.png" width={18} height={18} alt="" />
              <span><b>Xroga AI</b><small>initial production build</small></span>
              <code>a1b2c3d</code>
            </footer>
          </article>

          <div className="xv-se-live" aria-label="Live build, research, security, and control states">
            <div className="xv-se-live-head"><span>LIVE SYSTEM STATES</span><small>04 · 05 · 06</small></div>
            {LIVE_STATES.map(({ label, detail, Icon, tone }) => (
              <div key={label} className={`xv-se-live-row is-${tone}`}>
                <Icon /><span><b>{label}</b><small>{detail}</small></span><i />
              </div>
            ))}
          </div>

          <article className="xv-se-deploy" aria-label="Vercel production deployment">
            <header><span><ProviderLogo name="vercel" /><b>VERCEL</b></span><small><i /> PRODUCTION</small></header>
            <div className="xv-se-deploy-title"><small>Deployment</small><h3>Production</h3><span><i /> Ready</span></div>
            <dl>
              <div><dt>URL</dt><dd>client-product.vercel.app</dd></div>
              <div><dt>Commit</dt><dd><code>a1b2c3d</code></dd></div>
              <div><dt>Domain</dt><dd>example.com</dd></div>
            </dl>
            <a href="https://vercel.com" target="_blank" rel="noreferrer">View deployment <ArrowUpRight /></a>
          </article>

          <div className="xv-se-loop-legend" aria-label="Continuous product loop phases">
            <span>CONTINUOUS PRODUCT LOOP</span>
            <ol>
              {LOOP_PHASES.map((phase) => <li key={phase}>{phase}</li>)}
            </ol>
          </div>

          <footer className="xv-se-ownership">
            <div className="xv-se-ownership-title"><small>OWNERSHIP CONFIRMED</small><h3>YOU OWN THE PRODUCT.</h3></div>
            <dl>
              <div><dt>Your code</dt><dd>GitHub repository</dd></div>
              <div><dt>Your deploy</dt><dd>Vercel + your domain</dd></div>
              <div><dt>Your data</dt><dd>Secrets and infrastructure</dd></div>
            </dl>
            <p><Image src="/brand/xroga-mark.png" width={24} height={24} alt="Xroga" /> <span><b>Xroga ships it.</b> You own it.</span></p>
          </footer>
        </div>

        <nav className="xv-se-timeline" aria-label="Product lifecycle timeline">
          {TIMELINE.map((phase, index) => (
            <span key={phase} className={index === 3 ? 'is-active' : ''}><i>{String(index + 1).padStart(2, '0')}</i>{phase}</span>
          ))}
        </nav>
      </div>
    </section>
  );
}
