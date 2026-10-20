'use client';

import Image from 'next/image';
import { ArrowUpRight, FileText, Search, Code2, Rocket, Users } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import styles from './WorkspaceNewTerminal.module.css';

const CAPABILITIES = [
  { id: 'create', title: 'Create', icon: FileText, description: 'Docs, slides, images, code, web & apps, chatbots, tools, APIs and more.', prompt: 'Create ' },
  { id: 'find', title: 'Find', icon: Search, description: 'Web search, news, research, X.com, opportunities, hotels, restaurants and more.', prompt: 'Find ' },
  { id: 'build', title: 'Build', icon: Code2, description: 'Apps, automations, browser tasks, integrations, databases and complete solutions.', prompt: 'Build ' },
  { id: 'ship', title: 'Ship', icon: Rocket, description: 'Test and deploy websites, mobile apps, chatbots, extensions and desktop software.', prompt: 'Test and ship ' },
  { id: 'employees', title: 'AI Employees', icon: Users, description: 'Specialized AI employees for every kind of task.', prompt: 'Help me delegate a task to an AI employee: ' },
] as const;

const COMPACT_DESCRIPTIONS = {
  create: 'Documents, slides, images, apps & APIs.',
  find: 'Answers, news, research & opportunities.',
  build: 'Apps, automations & integrations.',
  ship: 'Test, repair & deploy your projects.',
  employees: 'Specialized AI employees for every task.',
};

export function WorkspaceStartHeader() {
  return (
    <header className={styles.hero} data-testid="workspace-start-header">
      <div className={styles.identity}>
        <Image src="/workspace/obsidian/black-hole.webp" alt="" width={2161} height={728} sizes="(max-width: 640px) 80vw, 440px" quality={90} priority className={styles.blackHole} />
        <p className={styles.superIntelligence}>Super Intelligence<sup>™</sup></p>
        <p className={styles.tagline}>One AI layer for every kind of work</p>
      </div>
      <h1 className={styles.headline}>DESCRIBE IT. <span>BUILD IT.</span> SHIP IT.</h1>
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
              <span className={styles.cardWords}><strong>{title}</strong><span className={styles.fullDescription}>{description}</span><span className={styles.compactDescription}>{COMPACT_DESCRIPTIONS[id]}</span></span>
              <ArrowUpRight className={styles.cardArrow} aria-hidden="true" />
            </span>
            <Image src={`/workspace/obsidian/${id}.webp`} alt="" width={1536} height={1024} quality={90} sizes="(max-width: 640px) 44vw, (max-width: 1100px) 18vw, 210px" className={styles.cardImage} />
          </button>
        ))}
      </div>
    </section>
  );
}
