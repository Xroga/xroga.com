'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  ChartNoAxesColumnIncreasing,
  Code2,
  FileText,
  LockKeyhole,
  Network,
  Rocket,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { XROGA_MODEL_FULL } from '@/lib/brand';

const CONCEPTS = [
  { Icon: Activity, position: 'state', label: 'State', copy: 'Understand status and context.', code: '01' },
  { Icon: FileText, position: 'evidence', label: 'Evidence', copy: 'See what happened and why.', code: '02' },
  { Icon: LockKeyhole, position: 'permission', label: 'Permission', copy: 'Know who can act and when.', code: '03' },
  { Icon: ShieldAlert, position: 'blockers', label: 'Blockers', copy: 'Surface risks that stop progress.', code: '04' },
] as const;

const CAPABILITIES = [
  {
    Icon: ChartNoAxesColumnIncreasing,
    code: 'REVIEW / 01',
    title: 'Reviewable execution',
    body: 'One customer-facing Xroga AI experience with changed files, validation, and publishing evidence.',
  },
  {
    Icon: Users,
    code: 'ACCESS / 02',
    title: 'Builders & non-devs',
    body: 'Plain language starts the work; required decisions, credentials, and review remain visible to the operator.',
  },
  {
    Icon: Rocket,
    code: 'BUILD / 03',
    title: 'Hackathon-ready MVPs',
    body: 'Build and iterate on demo projects in the same connected repository, with blockers shown truthfully.',
  },
  {
    Icon: Network,
    code: 'FLOW / 04',
    title: 'Outcome-first workflow',
    body: 'Understand → implement → validate → repair → push or publish when authorised.',
  },
] as const;

const STACK = [
  ['⚛', 'React'],
  ['N', 'Next.js'],
  ['TS', 'TypeScript'],
  ['JS', 'Node.js'],
  ['RN', 'React Native'],
  ['PY', 'Python'],
  ['≈', 'Tailwind CSS'],
  ['PG', 'PostgreSQL'],
  ['S', 'Supabase'],
] as const;

function InfinitySystem() {
  return (
    <div className="xv-er-core" aria-label="Xroga Black Hole V Infinity review system">
      <svg className="xv-er-orbits" viewBox="0 0 720 310" role="img" aria-labelledby="xv-er-infinity-title">
        <title id="xv-er-infinity-title">A connected infinity system representing continuous, reviewable execution</title>
        <defs>
          <linearGradient id="xv-er-edge" x1="0" x2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".16" />
            <stop offset=".5" stopColor="currentColor" stopOpacity=".92" />
            <stop offset="1" stopColor="currentColor" stopOpacity=".16" />
          </linearGradient>
          <linearGradient id="xv-er-ribbon" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".18" />
            <stop offset=".48" stopColor="currentColor" stopOpacity=".62" />
            <stop offset="1" stopColor="currentColor" stopOpacity=".12" />
          </linearGradient>
        </defs>
        <g className="xv-er-orbit-lines">
          <ellipse cx="360" cy="158" rx="328" ry="102" />
          <ellipse cx="360" cy="160" rx="285" ry="72" />
          <ellipse cx="360" cy="164" rx="232" ry="46" />
          <path d="M42 158C142 22 578 20 678 158" />
          <path d="M43 164C151 288 569 290 677 164" />
        </g>
        <g className="xv-er-ribbon">
          <path d="M155 165C155 94 211 64 267 78C310 89 333 128 360 158C389 190 412 229 458 235C519 243 566 207 566 158C566 107 519 72 460 80C414 86 389 127 360 158C331 189 307 230 259 236C203 243 155 213 155 165Z" />
          <path d="M169 164C169 108 213 84 259 94C300 103 326 136 360 171C395 207 419 229 461 223C509 217 551 190 551 159C551 125 511 99 465 94C421 89 395 115 360 151C327 185 300 217 258 225C212 233 169 211 169 164Z" />
        </g>
        <path className="xv-er-ribbon-edge" d="M155 165C155 94 211 64 267 78C310 89 333 128 360 158C389 190 412 229 458 235C519 243 566 207 566 158C566 107 519 72 460 80C414 86 389 127 360 158C331 189 307 230 259 236C203 243 155 213 155 165Z" />
        <g className="xv-er-nodes">
          <circle cx="155" cy="164" r="4" />
          <circle cx="360" cy="158" r="5" />
          <circle cx="566" cy="158" r="4" />
          <circle cx="360" cy="262" r="3" />
        </g>
        <path className="xv-er-ground" d="M118 270H602M180 284H540" />
      </svg>
      <div className="xv-er-core-meta" aria-hidden="true">
        <span>BLACK HOLE V∞</span><i /><span>REVIEW CORE ONLINE</span>
      </div>
    </div>
  );
}

export function HomepageEnterpriseProof() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`xv-er${isVisible ? ' is-visible' : ''}`}
      aria-labelledby="ent-heading"
    >
      <div className="xv-er-field" aria-hidden="true" />
      <div className="xv-er-inner">
        <div className="xv-er-stage">
          <div className="xv-er-stage-lines" aria-hidden="true" />
          <span className="xv-er-stage-edge" aria-hidden="true" />

          <header className="xv-er-heading">
            <span className="xv-er-mark" aria-hidden="true">∞</span>
            <p>BUILT FOR REAL REVIEW</p>
            <h2 id="ent-heading">Built for teams<br />that need evidence.</h2>
            <div>
              {XROGA_MODEL_FULL} keeps model selection internal while the product exposes the parts
              operators need to judge: state, evidence, permission, and blockers.
            </div>
          </header>

          <div className="xv-er-concepts">
            {CONCEPTS.map(({ Icon, position, label, copy, code }) => (
              <article key={label} tabIndex={0} className={`xv-er-concept is-${position}`}>
                <span className="xv-er-concept-icon"><Icon aria-hidden="true" /></span>
                <div><small>{code} / SYSTEM SIGNAL</small><h3>{label}</h3><p>{copy}</p></div>
              </article>
            ))}
          </div>

          <InfinitySystem />
        </div>

        <ol className="xv-er-capabilities">
          {CAPABILITIES.map(({ Icon, code, title, body }) => (
            <li key={title}>
              <span className="xv-er-cap-icon"><Icon aria-hidden="true" /></span>
              <div><small>{code}</small><h3>{title}</h3><p>{body}</p></div>
              <ArrowUpRight className="xv-er-cap-arrow" aria-hidden="true" />
            </li>
          ))}
        </ol>

        <div className="xv-er-stack" aria-label="Built with modern technology">
          <span className="xv-er-stack-title"><Code2 aria-hidden="true" /><b>BUILT WITH<br />MODERN TECHNOLOGY</b></span>
          <div className="xv-er-stack-list">
            {STACK.map(([mark, label]) => <span key={label}><i>{mark}</i>{label}</span>)}
            <span><i>+</i>&amp; more</span>
          </div>
        </div>
      </div>
    </section>
  );
}
