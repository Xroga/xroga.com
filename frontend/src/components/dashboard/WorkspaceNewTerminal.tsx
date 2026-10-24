'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronLeft, Search, Code2, Rocket, Users, Layers, Bot, Globe2, Puzzle, Pause, Play, X } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useThemeStore } from '@/store/useThemeStore';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
import Link from 'next/link';
import styles from './WorkspaceNewTerminal.module.css';
import controls from '@/components/terminal/WorkspaceControls.module.css';

const CAPABILITIES = [
  { id: 'create', title: 'Create', icon: Layers, description: 'Turn ideas into documents, slides, images and videos.', features: [
    ['Documents', 'Draft a document about: '], ['Presentations', 'Create a slide presentation about: '],
    ['Images', 'Create an image of: '], ['Video concepts', 'Plan a video with a script and storyboard about: '],
  ] },
  { id: 'find', title: 'Find', icon: Search, description: 'Find answers, files and opportunities. Research the web.', features: [
    ['Web research', 'Research this topic on the web and cite sources: '], ['Answers & comparisons', 'Compare these options and explain the tradeoffs: '],
    ['Files & knowledge', 'Find and summarize information in my attached files: '], ['Opportunities', 'Research opportunities that match these goals: '],
  ] },
  { id: 'build', title: 'Build', icon: Code2, description: 'Build websites, apps and automations from your ideas.', features: [
    ['Websites', 'Build a responsive website for: '], ['Apps', 'Build an app that helps people: '],
    ['APIs & databases', 'Design and build an API and database for: '], ['Automations', 'Plan and build an automation for: '],
  ] },
  { id: 'ship', title: 'Ship', icon: Rocket, description: 'Test, repair and launch your next website or app.', features: [
    ['Test a project', 'Test this project and report any issues: '], ['Debug & repair', 'Find the cause of this problem and repair it: '],
    ['Review readiness', 'Review this project for launch readiness: '], ['Prepare a launch', 'Prepare this project for deployment and ask before publishing: '],
  ] },
] as const;
const AUTOMATIONS = [
  { id: 'workflows', title: 'Workflows', icon: Layers, description: 'Build repeatable steps that move work from idea to verified result.', features: [
    ['Create a workflow', 'Build a workflow for this outcome: '], ['Review a workflow', 'Review and improve this workflow: '],
  ] },
  { id: 'scheduled-tasks', title: 'Scheduled Tasks', icon: Bot, description: 'Plan recurring work and review each run before it acts.', features: [
    ['Plan a schedule', 'Plan a scheduled task for: '], ['Review recurring work', 'Review the schedule and safeguards for: '],
  ] },
  { id: 'employees', title: 'AI Employees', icon: Users, description: 'Delegate research, content and everyday work to specialized AI employees.', features: [
    ['Research assistant', 'Help me delegate this research task to an AI employee: '], ['Content assistant', 'Help me delegate this content task to an AI employee: '],
    ['Operations assistant', 'Help me delegate this operations task to an AI employee: '],
  ] },
  { id: 'work-packs', title: 'Work Packs', icon: Layers, description: 'Start with an outcome; Xroga maps the people, tools and approvals.', features: [
    ['Plan a work pack', 'Plan a complete work pack for this outcome: '], ['Publish a blog', 'Plan a research, writing, review and publishing work pack for: '],
  ] },
  { id: 'browser-automation', title: 'Browser Automation', icon: Globe2, description: 'Research websites, test real interactions and simplify repetitive browser tasks.', features: [
    ['Browser testing', 'Test this website in a browser and report problems: '], ['Collect information', 'Collect and organize public information from these web pages: '],
    ['Repeat a workflow', 'Plan a browser workflow for this task, asking before sensitive actions: '],
  ] },
  { id: 'apps-mcp', title: 'Apps & MCP', icon: Puzzle, description: 'Connect authorized apps and MCP tools to your workflows.', features: [
    ['Connect tools', 'Help me connect the apps needed for this workflow: '], ['Sync information', 'Plan how to sync this information across my authorized apps: '],
    ['App automation', 'Build an automation using my connected apps for: '],
  ] },
] as const;
type Capability = typeof CAPABILITIES[number] | typeof AUTOMATIONS[number];
const TASK_ACCEPTANCE: Record<string, string> = {
  Documents: 'Produce a structured, editable document with a clear purpose, audience, logical sections, and a final proofreading pass.',
  Presentations: 'Create a slide-by-slide narrative with succinct speaker notes, legible visuals, and an editable presentation.',
  Images: 'Deliver the requested image with coherent composition, appropriate dimensions, and a clear description of the actual output.',
  'Video concepts': 'Develop a scene-by-scene script, storyboard, narration cues, timings, and production-ready prompts.',
  'Web research': 'Use relevant primary sources where possible, verify important claims, link the evidence, and distinguish facts from uncertain findings.',
  'Answers & comparisons': 'Define comparison criteria, explain each option’s tradeoffs, and recommend a choice with evidence and caveats.',
  'Files & knowledge': 'Use only accessible files, quote or cite the correct passages, and identify missing source information.',
  Opportunities: 'Identify concrete opportunities, their evidence, market relevance, prioritization, and a practical first action.',
  Websites: 'Build responsive, accessible pages with working navigation and forms, then test the finished implementation.',
  Apps: 'Define user journeys, implement the essential flows, protect data, and verify that the application actually works.',
  'APIs & databases': 'Define a safe data model and API contract, implement authentication and validation, and test core failure paths.',
  Automations: 'Map triggers, permissions, actions, retries, and postcondition checks; test with non-destructive examples first.',
  'Test a project': 'Run meaningful tests, capture reproducible failures, and report severity with exact next steps.',
  'Debug & repair': 'Reproduce the problem, identify the root cause, make a minimal fix, and test against regressions.',
  'Review readiness': 'Assess security, deployment configuration, performance, accessibility, monitoring, and unverified launch risks.',
  'Prepare a launch': 'Produce a launch checklist, validate production configuration, and request explicit approval before release.',
  'Research assistant': 'Define sources, milestones, and output format for the research employee, then require evidence-backed findings.',
  'Content assistant': 'Define voice, audience, content deliverables, review gates, and measurable editorial quality checks.',
  'Operations assistant': 'Describe the operational workflow, handoffs, exception handling, permissions, and verified completion criteria.',
  'Browser testing': 'Navigate permitted pages, exercise actual interactions, collect screenshots and failures, and provide a reproducible report.',
  'Collect information': 'Gather permitted public information, record source URLs and collection dates, deduplicate and validate findings.',
  'Repeat a workflow': 'Specify each browser step, expected outcome, recovery conditions, and approval needed for sensitive actions.',
  'Connect tools': 'Identify required authorized apps and scopes, confirm account access, and test connections without unapproved changes.',
  'Sync information': 'Identify source and destination systems, mapping rules, privacy protections, conflict resolution and verification.',
  'App automation': 'Design a secure connected-app flow with triggers, idempotency, retries, approval boundaries and evidence of execution.',
  'Create a workflow': 'Identify each step, required tools, approvals and expected outputs, then verify the path.',
  'Review a workflow': 'Check every step, failure path and permission before recommending changes.',
  'Plan a schedule': 'Specify timing, time zone, inputs, approvals and evidence for each scheduled run.',
  'Review recurring work': 'Find overlaps, missing approvals and recovery paths in the existing schedule.',
  'Plan a work pack': 'Map the outcome to employees, workflows, browser tools, apps, permissions, approvals and deliverables.',
  'Publish a blog': 'Map research, drafting, SEO review, human approval, publishing and post-publication verification.',
};

const STARTER_PROMPTS = [...CAPABILITIES, ...AUTOMATIONS].flatMap(card => card.features.map(feature => feature[1]));
const ROTATING_WORDS = [
  'work', 'automation', 'code', 'apps', 'websites', 'tools',
  'extensions', 'software', 'research', 'browser automation', 'app automation',
] as const;

function useRotation(length: number, paused: boolean, interval = 6000) {
  const [index, setIndex] = useState(0);
  const reducedMotion = useThemeStore(s => s.reducedMotion);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (!media.matches && document.visibilityState === 'visible') setIndex(value => (value + 1) % length);
    }, interval);
    return () => window.clearInterval(timer);
  }, [length, paused, reducedMotion, interval]);
  return [index, setIndex] as const;
}

/** Subtle scalable decoration, not text baked into an image. */
function CapabilityVisual({ id }: { id: Capability['id'] }) {
  const Icon = id === 'employees' ? Bot : id === 'browser-automation' ? Globe2 : id === 'apps-mcp' ? Puzzle : id === 'ship' ? Rocket : id === 'find' ? Search : null;
  return <span className={styles.visual} data-visual={id} aria-hidden="true">
    {Icon ? <Icon /> : <><i /><i /><i /></>}
  </span>;
}

export function WorkspaceStartHeader() {
  const [index] = useRotation(ROTATING_WORDS.length, false, 3400);
  return (
    <header className={styles.hero} data-testid="workspace-start-header">
      <h1 className={styles.superIntelligence}>Super Intelligence</h1>
      <div className={styles.taglineRow}>
        <p className={styles.tagline} aria-label="One AI workspace for every kind of work, from code and websites to research and automation.">
          One AI workspace for every kind of <span className={styles.dynamicWord} key={ROTATING_WORDS[index]} aria-hidden="true">{ROTATING_WORDS[index]}.</span>
        </p>
      </div>
    </header>
  );
}

function AutomaticIntro() {
  const [showDetail, setShowDetail] = useState(false);
  const reducedMotion = useThemeStore(state => state.reducedMotion);
  useEffect(() => {
    if (reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShowDetail(true);
      return;
    }
    const delay = window.setTimeout(() => setShowDetail(true), 2200);
    return () => window.clearTimeout(delay);
  }, [reducedMotion]);
  return <div className={styles.automatic} aria-label="Automatic intelligence by default. No models or tools to choose. Type or speak your goal. Xroga chooses the tools and handles the work.">
    <span className={styles.automaticFirst} data-visible={!showDetail} aria-hidden={showDetail}><strong>Automatic intelligence by default.</strong> No models or tools to choose.</span>
    <span className={styles.automaticDetail} data-visible={showDetail} aria-hidden={!showDetail}>
      Type or speak your goal. Xroga chooses the right tools and handles the work.
    </span>
  </div>;
}

function FeatureCard({ card, onInteraction }: { card: Capability; onInteraction?: (active: boolean) => void }) {
  const { prompt, setPrompt } = useTerminalChat();
  const [open, setOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<number | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  function close() { setOpen(false); setSelectedFeature(null); onInteraction?.(false); }
  function choose(feature: (typeof card.features)[number]) {
    const [label, text] = feature;
    const composer = document.querySelector<HTMLTextAreaElement>('[data-terminal-composer]');
    const currentDraft = composer?.value ?? prompt;
    const isStarter = STARTER_PROMPTS.some(starter => currentDraft === starter);
    // A complete, editable work request. Never send or run work on selection.
    const instruction = [
      `I want Xroga to help with ${label.toLowerCase()} (${card.title.toLowerCase()}).`,
      '',
      `My goal: ${text.trim()} [Describe your specific goal, content, links, audience, or constraints here.]`,
      '',
      'Please:',
      `Acceptance criteria: ${TASK_ACCEPTANCE[label] || 'Deliver an accurate, usable result and demonstrate that it meets the brief.'}`,
      '',
      'Execution requirements:',
      '1. Clarify only essential missing details, then state a concise outcome-focused plan.',
      '2. Select available tools, files, integrations and permissions automatically; do not make me choose models.',
      '3. Carry out the work, explain meaningful decisions, and handle errors without concealing them.',
      '4. Verify the final result through appropriate checks, evidence, or artifacts; report limitations explicitly.',
      '5. Ask for approval before publishing, making payments, sending messages, or changing external systems.',
      '',
      'Make the result polished and usable. Do not claim successful execution without evidence.',
    ].join('\n');
    setPrompt(!currentDraft.trim() || isStarter ? instruction : `${currentDraft.trimEnd()}\n\n${instruction}`);
    close();
    requestAnimationFrame(() => composer?.focus({ preventScroll: true }));
  }
  const Icon = card.icon;
  return <>
    <button ref={anchorRef} type="button" className={styles.card} data-capability={card.id}
      aria-haspopup="menu" aria-expanded={open} aria-label={card.title}
      onFocus={() => onInteraction?.(true)}
      onBlur={() => { if (!open) onInteraction?.(false); }}
      onClick={() => { if (open) { close(); return; } setSelectedFeature(null); setOpen(true); onInteraction?.(true); }}
    >
      <span className={styles.cardCopy}>
        <span className={styles.cardIcon}><Icon aria-hidden="true" /></span>
        <span className={styles.cardWords}><strong>{card.title}<ChevronRight className={styles.cardArrow} aria-hidden="true" /></strong><span>{card.description}</span></span>
      </span>
      <CapabilityVisual id={card.id} />
    </button>
    <AnchoredPortalPopover open={open} onClose={close} anchorRef={anchorRef} placement="top-start" width={264} ariaLabel={`${card.title} features`} className={controls.featureMenu}>
      <div ref={menuRef}
        onKeyDown={event => {
          if (event.key === 'Escape') { close(); anchorRef.current?.focus(); }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }
        }}

      >
        <div className={controls.featureHeading}>
          {selectedFeature !== null
            ? <button type="button" aria-label="Back to categories" className={controls.featureBack} onClick={() => setSelectedFeature(null)}><ChevronLeft size={15} /><span>Back</span></button>
            : <strong>{card.title}</strong>}
          <button type="button" onClick={() => { close(); anchorRef.current?.focus(); }} aria-label="Close features"><X size={14} /></button>
        </div>
        <p>{card.description}</p>
        {'id' in card && AUTOMATIONS.some(item => item.id === card.id) ? <Link href={`/dashboard/automations#${card.id === 'employees' ? 'ai-employees' : card.id}`} className={controls.featureChoose} onClick={close}>Open {card.title} workspace <ChevronRight size={14} aria-hidden="true" /></Link> : null}
        {selectedFeature === null ? <div className={controls.featureOptions} role="group" aria-label={`${card.title} categories`}>
          {card.features.map((feature, index) => <button type="button" role="menuitem"
            key={feature[0]}
            onMouseEnter={() => setSelectedFeature(index)}
            onFocus={() => setSelectedFeature(index)}
            onClick={() => setSelectedFeature(index)}>
            <span>{feature[0]}</span><ChevronRight size={14} aria-hidden="true" />
          </button>)}
        </div> : null}
        {selectedFeature !== null ? <div className={controls.featureDetail} role="region" aria-label={`${card.features[selectedFeature][0]} action`}>
          <strong>{card.features[selectedFeature][0]}</strong>
          <p>Describe your objective and Xroga will prepare the steps, discover the tools, carry out authorized work, and verify the deliverable.</p>
          <button type="button" className={controls.featureChoose}
            onClick={() => choose(card.features[selectedFeature])}>Use this in chat <ChevronRight size={14} aria-hidden="true" /></button>
        </div> : null}
      </div>
    </AnchoredPortalPopover>
  </>;
}

function AutomationCard() {
  const [interacting, setInteracting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useRotation(AUTOMATIONS.length, interacting || paused, 4000);
  return <div className={styles.carouselShell} onFocusCapture={() => setPaused(true)}>
    <FeatureCard key={AUTOMATIONS[index].id} card={AUTOMATIONS[index]} onInteraction={setInteracting} />
    <div className={styles.carouselDots} aria-label="Automation categories">
      {AUTOMATIONS.map((card, number) => <button key={card.id} type="button" aria-label={`Show ${card.title}`} aria-pressed={number === index} onClick={() => { setIndex(number); setPaused(true); }}><span /></button>)}
      <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume automation rotation' : 'Pause automation rotation'}>{paused ? <Play /> : <Pause />}</button>
    </div>
  </div>;
}

export function WorkspaceStartCards() {
  return (
    <section className={styles.starters} aria-label="Explore Xroga capabilities" data-testid="workspace-start-cards">
      <AutomaticIntro />
      <div className={styles.cards}>
        {CAPABILITIES.map(card => <div className={styles.cardShell} key={card.id}><FeatureCard card={card} /></div>)}
        <AutomationCard />
      </div>
    </section>
  );
}
