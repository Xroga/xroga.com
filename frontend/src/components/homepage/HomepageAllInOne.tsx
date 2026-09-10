'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Code2, Eye, FileCode2, Globe2, Search, ShieldCheck, Sparkles, Terminal, Workflow } from 'lucide-react';

const WORKFLOW_STAGES = [
  { name: 'Understand', detail: 'Reading the brief and project context', icon: Sparkles },
  { name: 'Research', detail: 'Finding current, relevant evidence', icon: Search },
  { name: 'Plan', detail: 'Choosing the smallest safe approach', icon: Workflow },
  { name: 'Build', detail: 'Implementing across the required files', icon: Code2 },
  { name: 'Verify', detail: 'Running checks and inspecting the result', icon: ShieldCheck },
  { name: 'Ready', detail: 'Showing evidence before any release', icon: Check },
] as const;

const PRODUCT_SCENARIOS = [
  { category: 'SaaS', repo: 'northstar/customer-cloud', branch: 'billing-portal', prompt: 'Build a customer portal with roles, billing, usage and accessible mobile states.', files: ['app/dashboard/page.tsx', 'lib/billing.ts', 'api/usage/route.ts'], result: 'Customer portal ready for review' },
  { category: 'Mobile app', repo: 'fieldnote/mobile', branch: 'offline-capture', prompt: 'Create an offline-first inspection app for iOS and Android with safe sync.', files: ['app/capture.tsx', 'lib/sync.ts', 'stores/inspection.ts'], result: 'Mobile workflow tested on two viewports' },
  { category: 'API', repo: 'relay/webhook-api', branch: 'signed-events', prompt: 'Add signed webhooks, idempotent retries, audit logs and integration tests.', files: ['src/webhooks.ts', 'src/retry.ts', 'test/events.test.ts'], result: 'API contract and retry path verified' },
  { category: 'Browser extension', repo: 'atlas/research-tool', branch: 'capture-flow', prompt: 'Build a browser extension that captures sources and exports a cited brief.', files: ['src/content.ts', 'src/panel.tsx', 'src/export.ts'], result: 'Extension flow ready for browser review' },
  { category: 'Existing repo', repo: 'studio/design-system', branch: 'accessible-menu', prompt: 'Fix keyboard navigation without changing the existing visual language.', files: ['Menu.tsx', 'focusManager.ts', 'Menu.test.tsx'], result: 'Focused change with regression proof' },
  { category: 'Automation', repo: 'ops/release-bot', branch: 'release-notes', prompt: 'Turn merged changes into reviewed release notes and a safe approval flow.', files: ['workflows/release.ts', 'lib/changelog.ts', 'release.test.ts'], result: 'Automation prepared; approval still required' },
] as const;

const CAPABILITIES = ['Project context', 'Web research', 'Code changes', 'Data & APIs', 'Browser checks', 'GitHub handoff'] as const;

export function HomepageAllInOne() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const scenario = PRODUCT_SCENARIOS[scenarioIndex];

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return;
    const timer = window.setInterval(() => {
      setStageIndex((current) => {
        if (current < WORKFLOW_STAGES.length - 1) return current + 1;
        setScenarioIndex((active) => (active + 1) % PRODUCT_SCENARIOS.length);
        return 0;
      });
    }, 1200);
    return () => window.clearInterval(timer);
  }, []);

  const chooseScenario = (index: number) => {
    setScenarioIndex(index);
    setStageIndex(0);
  };

  return (
    <section className="xv-aio xv-uw" aria-labelledby="xroga-all-in-one-heading">
      <header className="xv-aio__heading xv-uw__heading">
        <p>ONE REQUEST · VISIBLE WORK</p>
        <h2 id="xroga-all-in-one-heading">What can you build <em>with Xroga?</em></h2>
        <span>Any product. One clear path from request to tested result.</span>
      </header>

      <div className="xv-uw__selector" role="group" aria-label="Choose a product workflow">
        {PRODUCT_SCENARIOS.map((item, index) => (
          <button type="button" className={index === scenarioIndex ? 'is-active' : ''} aria-pressed={index === scenarioIndex} onClick={() => chooseScenario(index)} key={item.category}>{item.category}</button>
        ))}
      </div>

      <div className="xv-uw__stage" aria-label="Interactive Xroga workflow demonstration">
        <header className="xv-uw__topbar">
          <span className="xv-uw__live"><i aria-hidden="true" /> LIVE WORKFLOW</span>
          <span className="xv-uw__repo"><Terminal aria-hidden="true" /> {scenario.repo} <b>{scenario.branch}</b></span>
          <span className="xv-uw__context">Project context locked</span>
        </header>

        <div className="xv-uw__workspace" key={scenario.repo}>
          <section className="xv-uw__conversation" aria-label="Prompt and build progress">
            <div className="xv-uw__prompt"><span>You</span><p>{scenario.prompt}<i aria-hidden="true" /></p></div>
            <div className="xv-uw__thinking" aria-live="polite">
              <header><Sparkles aria-hidden="true" /><span>Xroga is working</span><b>{WORKFLOW_STAGES[stageIndex].name}</b></header>
              <ol>
                {WORKFLOW_STAGES.map(({ name, detail, icon: Icon }, index) => (
                  <li className={index < stageIndex ? 'is-done' : index === stageIndex ? 'is-active' : ''} key={name}>
                    <i><Icon aria-hidden="true" /></i><span><b>{name}</b><small>{detail}</small></span>{index < stageIndex ? <Check aria-label="Complete" /> : <em aria-hidden="true" />}
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="xv-uw__product" aria-label="Visible project changes and preview">
            <nav aria-label="Workspace views"><span><FileCode2 aria-hidden="true" /> Files</span><span><Code2 aria-hidden="true" /> Changes</span><span className="is-active"><Eye aria-hidden="true" /> Preview</span></nav>
            <div className="xv-uw__preview">
              <div className="xv-uw__preview-browser"><i /><i /><i /><span>{scenario.category} preview</span></div>
              <div className="xv-uw__preview-canvas"><header><span>{scenario.category}</span><i /></header><strong>{scenario.result}</strong><p>Responsive states, useful interactions and the project&apos;s existing constraints stay in view.</p><div><i /><i /><i /></div></div>
            </div>
            <div className="xv-uw__changes">{scenario.files.map((file, index) => <span className={index <= Math.min(stageIndex, 2) ? 'is-visible' : ''} key={file}><FileCode2 aria-hidden="true" /> {file}</span>)}</div>
          </section>
        </div>

        <div className="xv-uw__capabilities" aria-label="Capabilities used when relevant">{CAPABILITIES.map((capability, index) => <span className={index <= stageIndex ? 'is-active' : ''} key={capability}><Check aria-hidden="true" />{capability}</span>)}</div>
        <footer className="xv-uw__proof">
          <span><ShieldCheck aria-hidden="true" /><b>Evidence first</b> Checks and blockers stay visible.</span>
          <span><Globe2 aria-hidden="true" /><b>Honest limits</b> Plan capacity is shown before work.</span>
          <span><Eye aria-hidden="true" /><b>You authorize</b> External actions require permission.</span>
        </footer>
      </div>

      <p className="xv-uw__disclaimer">Illustrative workflow. Available tools and checks depend on the selected project and authorized accounts.</p>
      <Link href="/features" className="xv-aio__link">Explore every capability <ArrowUpRight aria-hidden="true" /></Link>
    </section>
  );
}
