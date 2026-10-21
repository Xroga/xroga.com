'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Search, Code2, Rocket, Users, Layers, Bot, Globe2, Puzzle, Pause, Play, X } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useThemeStore } from '@/store/useThemeStore';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
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
  { id: 'employees', title: 'AI Employees', icon: Users, description: 'Delegate research, content and everyday work to specialized AI employees.', features: [
    ['Research assistant', 'Help me delegate this research task to an AI employee: '], ['Content assistant', 'Help me delegate this content task to an AI employee: '],
    ['Operations assistant', 'Help me delegate this operations task to an AI employee: '],
  ] },
  { id: 'browser', title: 'Browser automation', icon: Globe2, description: 'Research websites, test real interactions and simplify repetitive browser tasks.', features: [
    ['Browser testing', 'Test this website in a browser and report problems: '], ['Collect information', 'Collect and organize public information from these web pages: '],
    ['Repeat a workflow', 'Plan a browser workflow for this task, asking before sensitive actions: '],
  ] },
  { id: 'plugins', title: 'Apps & plugins', icon: Puzzle, description: 'Connect your tools and automate workflows across your authorized apps.', features: [
    ['Connect tools', 'Help me connect the apps needed for this workflow: '], ['Sync information', 'Plan how to sync this information across my authorized apps: '],
    ['App automation', 'Build an automation using my connected apps for: '],
  ] },
] as const;
type Capability = typeof CAPABILITIES[number] | typeof AUTOMATIONS[number];
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
  const Icon = id === 'employees' ? Bot : id === 'browser' ? Globe2 : id === 'plugins' ? Puzzle : id === 'ship' ? Rocket : id === 'find' ? Search : null;
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
  return <div className={styles.automatic} aria-label="Automatic by default. No models or tools to choose. Type or speak what you need, and Xroga routes the work.">
    <span className={styles.automaticFirst} data-visible={!showDetail} aria-hidden={showDetail}><strong>Automatic by default.</strong></span>
    <span className={styles.automaticDetail} data-visible={showDetail} aria-hidden={!showDetail}>
      No models or tools to choose. Type or speak what you need, and Xroga routes the work.
    </span>
  </div>;
}

/** Mouse-only highlight coordinates avoid React render work on every pointer movement. */
function moveCardSpotlight(event: React.PointerEvent<HTMLButtonElement>) {
  if (event.pointerType !== 'mouse') return;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  event.currentTarget.style.setProperty('--spot-x', `${((event.clientX - bounds.left) / bounds.width * 100).toFixed(1)}%`);
  event.currentTarget.style.setProperty('--spot-y', `${((event.clientY - bounds.top) / bounds.height * 100).toFixed(1)}%`);
}

function resetCardSpotlight(event: React.PointerEvent<HTMLButtonElement>) {
  event.currentTarget.style.removeProperty('--spot-x');
  event.currentTarget.style.removeProperty('--spot-y');
}

function FeatureCard({ card, onInteraction }: { card: Capability; onInteraction?: (active: boolean) => void }) {
  const { prompt, setPrompt } = useTerminalChat();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  function close() { setOpen(false); onInteraction?.(false); }
  function choose(text: string) {
    const composer = document.querySelector<HTMLTextAreaElement>('[data-terminal-composer]');
    const currentDraft = composer?.value ?? prompt;
    const isStarter = STARTER_PROMPTS.some(starter => currentDraft === starter);
    // Feature selection is deliberate, but a user's existing brief is never discarded.
    setPrompt(!currentDraft.trim() || isStarter ? text : `${currentDraft.trimEnd()}\n\n${text}`);
    close();
    requestAnimationFrame(() => composer?.focus({ preventScroll: true }));
  }
  const Icon = card.icon;
  return <>
    <button ref={anchorRef} type="button" className={styles.card} data-capability={card.id}
      aria-haspopup="menu" aria-expanded={open} aria-label={card.title} title={card.title}
      onFocus={() => onInteraction?.(true)}
      onBlur={() => { if (!open) onInteraction?.(false); }}
      onPointerMove={moveCardSpotlight}
      onPointerLeave={resetCardSpotlight}
      onClick={() => { if (open) { close(); return; } setOpen(true); onInteraction?.(true); requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()); }}
    >
      <span className={styles.cardCopy}>
        <span className={styles.cardIcon}><Icon aria-hidden="true" /></span>
        <span className={styles.cardWords}><strong>{card.title}<ChevronRight className={styles.cardArrow} aria-hidden="true" /></strong><span>{card.description}</span></span>
      </span>
      <CapabilityVisual id={card.id} />
    </button>
    <AnchoredPortalPopover open={open} onClose={close} anchorRef={anchorRef} placement="top-start" width={260} ariaLabel={`${card.title} features`} className={controls.featureMenu}>
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
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== anchorRef.current) close(); }}
      >
        <div className={controls.featureHeading}><strong>{card.title}</strong><button type="button" onClick={() => { close(); anchorRef.current?.focus(); }} aria-label="Close features"><X size={14} /></button></div>
        <p>{card.description}</p>
        {card.features.map(([label, text]) => <button type="button" role="menuitem" key={label} onClick={() => choose(text)}><span>{label}</span><ChevronRight size={14} aria-hidden="true" /></button>)}
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
