'use client';

import { ChevronRight, Search, Code2, Rocket, Users, Layers, Bot } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import styles from './WorkspaceNewTerminal.module.css';

const CAPABILITIES = [
  { id: 'create', title: 'Create', icon: Layers, description: 'Turn ideas into documents, slides, images and videos.', prompt: 'Create ' },
  { id: 'find', title: 'Find', icon: Search, description: 'Find answers, files and opportunities. Research the web.', prompt: 'Find ' },
  { id: 'build', title: 'Build', icon: Code2, description: 'Build websites, apps and automations from your ideas.', prompt: 'Build ' },
  { id: 'ship', title: 'Ship', icon: Rocket, description: 'Test, repair and launch your next website or app.', prompt: 'Test and ship ' },
  { id: 'employees', title: 'AI Employees', icon: Users, description: 'Delegate research, content and everyday work to specialized AI employees.', prompt: 'Help me delegate a task to an AI employee: ' },
] as const;

/** Quiet vector decoration; descriptions stay in real, readable text. */
function CapabilityVisual({ id }: { id: typeof CAPABILITIES[number]['id'] }) {
  const Icon = id === 'employees' ? Bot : id === 'ship' ? Rocket : id === 'find' ? Search : null;
  return <span className={styles.visual} data-visual={id} aria-hidden="true">
    {Icon ? <Icon /> : <><i /><i /><i /></>}
  </span>;
}

export function WorkspaceStartHeader() {
  return (
    <header className={styles.hero} data-testid="workspace-start-header">
      <div className={styles.identity}>
        <h1 className={styles.superIntelligence}>Super Intelligence<sup>™</sup></h1>
        <p className={styles.tagline}>One AI workspace for every kind of work.</p>
      </div>
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
          <button type="button" key={id} className={styles.card} data-capability={id} onClick={() => choose(prefix)} aria-pressed={prompt === prefix}>
            <span className={styles.cardCopy}>
              <span className={styles.cardIcon}><Icon aria-hidden="true" /></span>
              <span className={styles.cardWords}><strong>{title}<ChevronRight className={styles.cardArrow} aria-hidden="true" /></strong><span>{description}</span></span>
            </span>
            <CapabilityVisual id={id} />
          </button>
        ))}
      </div>
    </section>
  );
}
