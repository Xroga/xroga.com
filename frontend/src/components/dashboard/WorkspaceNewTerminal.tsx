'use client';

import Image from 'next/image';
import { ArrowUpRight, FileText, Search, Code2, Rocket, Users, Layers, Image as ImageIcon, Globe2, Zap, Link2, Server, Database, HardDrive, Smartphone, Monitor, Puzzle, Bot, Check, Plane, MapPin } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import styles from './WorkspaceNewTerminal.module.css';

const CAPABILITIES = [
  { id: 'create', title: 'Create', icon: Layers, description: 'Docs, slides, images, code, apps, chatbots, APIs & more.', prompt: 'Create ' },
  { id: 'find', title: 'Find', icon: Search, description: 'Web, research, opportunities, travel, places & files.', prompt: 'Find ' },
  { id: 'build', title: 'Build', icon: Code2, description: 'Apps, automations, browser tasks, databases & AI employees.', prompt: 'Build ' },
  { id: 'ship', title: 'Ship', icon: Rocket, description: 'Launch websites, apps, chatbots, extensions & desktop tools.', prompt: 'Test and ship ' },
  { id: 'employees', title: 'AI Employees', icon: Users, description: 'Specialized AI employees for every kind of task.', prompt: 'Help me delegate a task to an AI employee: ' },
] as const;

const BUILD_TILES = [
  [Globe2, 'Browser'], [Zap, 'Automations'], [Link2, 'Domains'],
  [Server, 'Hosting'], [Database, 'Database'], [HardDrive, 'Storage'],
] as const;
const SHIP_TILES = [
  [Globe2, 'Websites'], [Smartphone, 'Apps'], [Bot, 'Android'],
  [Smartphone, 'iOS'], [Puzzle, 'Extensions'], [Monitor, 'Desktop'],
] as const;

/** Decorative, scalable interface layouts, not nested controls or screenshot crops. */
function CapabilityVisual({ id }: { id: typeof CAPABILITIES[number]['id'] }) {
  if (id === 'build' || id === 'ship') {
    return <span className={styles.tileGrid} aria-hidden="true">{(id === 'build' ? BUILD_TILES : SHIP_TILES).map(([Icon, label]) =>
      <span className={styles.miniTile} key={label}><Icon /><span>{label}</span></span>
    )}</span>;
  }
  if (id === 'create') {
    return <span className={styles.createVisual} aria-hidden="true">
      <span className={styles.sheets}><i /><i /><i /><i /></span>
      <span className={styles.floatingTools}><span><FileText /></span><span><ImageIcon /></span><span><Code2 /></span></span>
    </span>;
  }
  if (id === 'find') {
    return <span className={styles.findVisual} aria-hidden="true">
      <span className={styles.world}><i /><i /><i /></span>
      <span className={styles.searchPill}><Search />Search the world<span>⌕</span></span>
      <span className={styles.findTools}><FileText /><ImageIcon /><Plane /><MapPin /></span>
    </span>;
  }
  return <span className={styles.teamVisual} aria-hidden="true">
    <span className={styles.teamNodes}><span><Search /></span><span><Code2 /></span><span><Bot /></span><span><FileText /></span><span><Zap /></span></span>
    <span className={styles.teamCaption}><Check /> Your specialized workforce</span>
  </span>;
}

export function WorkspaceStartHeader() {
  return (
    <header className={styles.hero} data-testid="workspace-start-header">
      <div className={styles.identity}>
        <h1 className={styles.superIntelligence}>Super Intelligence<sup>™</sup></h1>
        <p className={styles.tagline}>One AI workspace for every kind of work.</p>
      </div>
      <Image src="/workspace/obsidian/black-hole.webp" alt="" width={2161} height={728} sizes="(max-width: 640px) 80vw, 420px" quality={90} priority className={styles.blackHole} />
    </header>
  );
}

export function WorkspaceStartCards() {
  const { prompt, setPrompt } = useTerminalChat();
  function choose(prefix: string) {
    // Do not submit, overwrite a written brief, or trigger a billable run.
    const composer = document.querySelector<HTMLTextAreaElement>('[data-terminal-composer]');
    // The composer owns immediate keystrokes; context persistence is debounced.
    const currentDraft = composer?.value ?? prompt;
    const isStarter = CAPABILITIES.some(capability => currentDraft === capability.prompt);
    if (!currentDraft.trim() || isStarter) setPrompt(prefix);
    requestAnimationFrame(() => composer?.focus({ preventScroll: true }));
  }
  return (
    <section className={styles.starters} aria-label="Explore Xroga capabilities" data-testid="workspace-start-cards">
      <p className={styles.automatic}>Automatic by default — just describe the outcome.</p>
      <div className={styles.cards}>
        {CAPABILITIES.map(({ id, title, icon: Icon, description, prompt: prefix }) => (
          <button type="button" key={id} className={styles.card} onClick={() => choose(prefix)} aria-pressed={prompt === prefix}>
            <span className={styles.cardCopy}>
              <span className={styles.cardIcon}><Icon aria-hidden="true" /></span>
              <span className={styles.cardWords}><strong>{title}</strong><span>{description}</span></span>
              <ArrowUpRight className={styles.cardArrow} aria-hidden="true" />
            </span>
            <CapabilityVisual id={id} />
          </button>
        ))}
      </div>
    </section>
  );
}
