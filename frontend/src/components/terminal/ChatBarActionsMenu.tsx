'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { DRIVE_ENABLED } from '@/lib/driveApi';
import { ArrowUpRight, Bot, Bug, Check, ChevronRight, Command, FolderOpen, Globe2, Library, ListChecks, Paperclip, Plus, Puzzle, ScrollText, Sparkles, TerminalSquare, Workflow, X } from 'lucide-react';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { CirclePlayIcon } from '@/components/icons/animated/CirclePlayIcon';
import {
  COMPOSER_COMMANDS,
  COMPOSER_SKILLS,
  useComposerToolsStore,
} from '@/store/useComposerToolsStore';
import { cn } from '@/lib/utils';
import controls from './WorkspaceControls.module.css';

/**
 * The composer's extra actions, behind one compact trigger.
 *
 * The toolbar was already at capacity — Black Hole, integrations, GitHub, Vercel, and
 * it scrolls horizontally on a phone. Adding four more chips inline would have made
 * the bar unusable, which is exactly what you asked me to avoid. One `+` opens a menu
 * instead, so the resting bar gains a single compact control.
 *
 * A dot on the trigger marks that rules or packs are active, because a prompt being
 * silently modified is worse than no feature at all.
 */
const WORK_OPTIONS = [
  { id: 'library', label: 'Library', description: 'Find, read and reuse your saved files.', icon: Library, examples: [
    ['Find a file', 'Find the document or file about: '],
    ['Summarize files', 'Summarize these files and list the important findings: '],
    ['Create a deliverable', 'Use my attached files to create a polished deliverable about: '],
  ] },
  { id: 'projects', label: 'Projects', description: 'Continue building and testing in your projects.', icon: FolderOpen, examples: [
    ['Continue a project', 'Continue work on my current project. Inspect its state and remaining tasks: '],
    ['Build a feature', 'Implement and verify this feature in my selected project: '],
    ['Review a repository', 'Review my selected repository and propose evidence-based repairs: '],
  ] },
  { id: 'browser', label: 'Browser automation', description: 'Research sites and test browser workflows.', icon: Globe2, examples: [
    ['Research a website', 'Inspect and research this website, citing what you find: '],
    ['Test a workflow', 'Test this website workflow and report verified results: '],
    ['Automate a browser task', 'Plan and perform this browser task with approval for sensitive actions: '],
  ] },
  { id: 'employees', label: 'AI Employees', description: 'Delegate repeatable work to specialist assistants.', icon: Bot, examples: [
    ['Research employee', 'Set up a research assistant for the following task: '],
    ['Operations employee', 'Plan an AI employee for this recurring operations work: '],
    ['Content employee', 'Plan and delegate this content workflow to an AI employee: '],
  ] },
  { id: 'apps', label: 'Apps automation', description: 'Use authorized apps for connected workflows.', icon: Workflow, examples: [
    ['Connect an app', 'Help connect the app required for this task: '],
    ['Design a workflow', 'Build a workflow across my connected apps to: '],
    ['Sync information', 'Check permissions and plan a data sync between my authorized apps: '],
  ] },
] as const;

export type ComposerInsertOptions = {
  highlight?: 'command' | 'plan' | 'debug';
  selectionLength?: number;
  label?: string;
  category?: string;
  description?: string;
  tone?: 'blue' | 'orange' | 'red' | 'green' | 'purple' | 'gray';
};

export function ChatBarActionsMenu({
  onInsert,
  onAddFiles,
  onOpenIntegrations,
  connectorsNeedingAttention = 0,
  recentTerminal,
  disabled,
  className,
  plusIcon = false,
}: {
  /** Fills the composer with a scaffold for the user to edit. Never auto-sends. */
  onInsert: (text: string, options?: ComposerInsertOptions) => void;
  onAddFiles?: () => void;
  /**
   * Opens the integrations surface. This used to be a pill sitting beside the `+`,
   * which read as a second, competing entry point to the same dialog; it is a menu
   * row now, and the pill is gone.
   */
  onOpenIntegrations?: () => void;
  /** Drives the "n needs reconnection" note. 0 means everything is connected. */
  connectorsNeedingAttention?: number;
  /** Optional recent work shown as a compact continuation card above the tools. */
  recentTerminal?: {
    title: string;
    detail: string;
    onContinue: () => void;
  };
  disabled?: boolean;
  className?: string;
  plusIcon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<'menu' | 'commands' | 'skills' | 'rules' | 'work'>('menu');
  const [workId, setWorkId] = useState<string>('library');
  const activeWork = WORK_OPTIONS.find(item => item.id === workId) ?? WORK_OPTIONS[0];
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const rules = useComposerToolsStore((s) => s.rules);
  const setRules = useComposerToolsStore((s) => s.setRules);
  const enabledSkills = useComposerToolsStore((s) => s.enabledSkills);
  const toggleSkill = useComposerToolsStore((s) => s.toggleSkill);

  const activeCount = enabledSkills.length + (rules.trim() ? 1 : 0);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const sync = () => {
      const composer = rootRef.current?.closest<HTMLElement>('.xv-chatbar-solid');
      if (!composer) return;
      const frame = composer.closest<HTMLElement>('.xv-kimi-composer-frame') ?? composer;
      const rect = frame.getBoundingClientRect();
      const width = Math.min(rect.width, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const idle = Boolean(composer.closest('.xv-terminal-dock--idle'));
      if (idle) {
        const available = window.innerHeight - rect.bottom - 16;
        setMenuStyle(available >= 160 ? {
          position: 'fixed', left, top: rect.bottom + 6,
          bottom: 'auto', width,
          maxHeight: Math.max(120, Math.min(480, available)),
        } : {
          position: 'fixed', left, top: 'auto',
          bottom: Math.max(8, window.innerHeight - rect.top + 6), width,
          maxHeight: Math.max(120, Math.min(440, rect.top - 12)),
        });
        return;
      }
      setMenuStyle({
        position: 'fixed', left, top: 'auto',
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
        width,
        maxHeight: Math.min(480, Math.max(130, rect.top - 12)),
      });
    };
    sync();
    window.addEventListener('resize', sync);
    // The menu is portalled to the document body. Any ancestor can scroll while the
    // composer moves underneath it, so keep the portal aligned on captured scrolls
    // as well as viewport resizes. This is what makes it remain attached to the
    // composer's upper edge inside the idle workspace scroller.
    window.addEventListener('scroll', sync, { capture: true, passive: true });
    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync, { passive: true });
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
    };
  }, [open, panel]);

  // Always reopen on the menu — landing back inside the rules editor after a close
  // is disorienting when the trigger looks like a single generic button.
  useEffect(() => {
    if (!open) setPanel('menu');
  }, [open]);

  function insert(text: string, options?: ComposerInsertOptions) {
    onInsert(text, options);
    setOpen(false);
  }

  return (
    /* Deliberately not a positioning context. The portal is measured from the full
       composer surface and keeps a small visual gap; anchoring it here would pin it
       to one button in the middle of the composer's bottom row. */
    <div ref={rootRef} className={cn('xv-cba-root shrink-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        data-open={open ? 'true' : 'false'}
        className="xv-cba-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More composer actions"
        data-short-tip="More actions"
      >
        {/* The ring draws itself and the symbol lands inside it. The 45deg turn that
            marked the open state came from the plus reading as a close cross when
            rotated; this glyph is not a cross, so the open state is carried by
            `data-open` in the stylesheet instead. */}
        {plusIcon ? <Plus size={18} aria-hidden="true" /> : <AnimatedIcon icon={CirclePlayIcon} size={16} />}
        {activeCount > 0 && <span className="xv-cba-dot" aria-hidden="true" />}
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div ref={menuRef} className={cn('xv-cba-menu', controls.actions)} role="dialog" aria-label="Composer actions" style={{ ...menuStyle, '--xv-actions-width': `${menuStyle.width}px` } as React.CSSProperties}>
          {panel === 'menu' && (
            <div className="xv-cba-grid">
              {recentTerminal && (
                <button
                  type="button"
                  className="xv-cba-item xv-cba-recent xv-cba-item--wide"
                  onClick={() => {
                    recentTerminal.onContinue();
                    setOpen(false);
                  }}
                >
                  <span className="xv-cba-recent__icon"><TerminalSquare aria-hidden="true" /></span>
                  <span className="xv-cba-item__text">
                    <small>CONTINUE WHERE YOU STOPPED</small>
                    <b>{recentTerminal.title}</b>
                    <i>{recentTerminal.detail}</i>
                  </span>
                  <ArrowUpRight className="xv-cba-recent__arrow" aria-hidden="true" />
                </button>
              )}

              <button type="button" className="xv-cba-item" data-tone="gray" disabled={!onAddFiles} onClick={() => { onAddFiles?.(); setOpen(false); }}>
                <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text"><b>Add files or photos</b><i>Upload from computer</i></span>
                <kbd className="xv-cba-kbd">Ctrl+U</kbd>
              </button>
              <button type="button" className="xv-cba-item xv-cba-item--integrations" data-tone="purple" disabled={!onOpenIntegrations} onClick={() => { onOpenIntegrations?.(); setOpen(false); }}>
                <Puzzle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text"><b>Plugins</b><i>Connect and manage supported apps</i></span>
                {connectorsNeedingAttention > 0 && <i className="xv-cba-flag" aria-hidden="true" />}
              </button>
              {WORK_OPTIONS.map(item => {
                const Icon = item.icon;
                return <button key={item.id} type="button" className="xv-cba-item xv-cba-work"
                  data-tone={item.id === 'library' || item.id === 'browser' ? 'blue' : item.id === 'projects' || item.id === 'apps' ? 'green' : 'purple'}
                  onClick={() => { setWorkId(item.id); setPanel('work'); }}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="xv-cba-item__text"><b>{item.label}</b><i>{item.description}</i></span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>;
              })}
              <button type="button" className="xv-cba-item xv-cba-item--command" data-tone="blue" onClick={() => setPanel('commands')}>
                <Command className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text"><b>Slash commands</b><i>Build, plan, debug, audit, test, or deploy</i></span>
              </button>
              <button type="button" className="xv-cba-item xv-cba-item--plan" data-tone="orange" onClick={() => insert('Plan this build first. Show the approach, affected files, checks, and blockers before changing anything: ', { highlight: 'plan', selectionLength: 'Plan this build first.'.length, label: 'Plan before build', category: 'Planning', description: 'Draft a plan before changing any files. Execution still requires you to send.', tone: 'orange' })}>
                <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text"><b>Plan before build</b><i>Get the approach first, change nothing yet</i></span>
              </button>
              <button type="button" className="xv-cba-item xv-cba-item--debug" data-tone="red" onClick={() => insert('Debug this error, identify the root cause, and fix it: ', { highlight: 'debug', selectionLength: 'Debug this error'.length, label: 'Debug an error', category: 'Debugging', description: 'Inspect the error, identify the cause, and verify the repair.', tone: 'red' })}>
                <Bug className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text"><b>Debug an error</b><i>Paste the error, get the root cause</i></span>
              </button>
              <button type="button" className="xv-cba-item" data-tone="purple" onClick={() => setPanel('skills')}>
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text"><b>Skills</b><i>{enabledSkills.length ? `${enabledSkills.length} active` : 'Reusable instruction packs'}</i></span>
              </button>
              <button type="button" className="xv-cba-item" data-tone="gray" onClick={() => setPanel('rules')}>
                <ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text"><b>Rules</b><i>{rules.trim() ? 'Applied to every prompt' : 'Standing instructions you write'}</i></span>
              </button>
            </div>
          )}

          {panel === 'work' && (
            <>
              <div className="xv-cba-head">
                <button type="button" onClick={() => setPanel('menu')} className="xv-cba-back">Back</button>
                <span>{activeWork.label}</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </div>
              <p className="xv-cba-note">{activeWork.description} Choose an example to edit. Nothing runs until you send.</p>
              {activeWork.id === 'library' && DRIVE_ENABLED && <Link href="/drive" className="xv-cba-item" onClick={() => setOpen(false)}>
                <Library className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text"><b>Open Xroga Drive</b><i>Upload, download and manage your private files.</i></span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </Link>}
              <div className="xv-cba-command-list" role="group" aria-label={activeWork.label + ' examples'}>
                {activeWork.examples.map(([label, prompt]) => (
                  <button key={label} type="button" className="xv-cba-item xv-cba-work-example"
                    data-tone={activeWork.id === 'library' || activeWork.id === 'browser' ? 'blue' : activeWork.id === 'projects' || activeWork.id === 'apps' ? 'green' : 'purple'}
                    onClick={() => insert(prompt, { label, category: activeWork.label, description: activeWork.description, tone: activeWork.id === 'library' || activeWork.id === 'browser' ? 'blue' : activeWork.id === 'projects' || activeWork.id === 'apps' ? 'green' : 'purple' })}>
                    <span className="xv-cba-item__text"><b>{label}</b><i>{prompt}</i></span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          )}

          {panel === 'commands' && (
            <>
              <div className="xv-cba-head">
                <button type="button" onClick={() => setPanel('menu')} className="xv-cba-back">
                  Back
                </button>
                <span>Slash commands</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="xv-cba-command-list" role="menu" aria-label="Xroga slash commands">
                {COMPOSER_COMMANDS.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    role="menuitem"
                    className="xv-cba-item xv-cba-command"
                    data-tone="blue"
                    onClick={() => insert(command.prompt, { highlight: 'command', selectionLength: command.command.length, label: command.command, category: 'Slash command', description: command.description, tone: 'blue' })}
                  >
                    <code>{command.command}</code>
                    <span className="xv-cba-item__text">
                      <b>{command.label}</b>
                      <i>{command.description}</i>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {panel === 'skills' && (
            <>
              <div className="xv-cba-head">
                <button type="button" onClick={() => setPanel('menu')} className="xv-cba-back">
                  Back
                </button>
                <span>Skills</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <p className="xv-cba-note">
                Each pack adds its instruction above your prompt. Nothing is sent until you press
                send.
              </p>
              {COMPOSER_SKILLS.map((skill) => {
                const on = enabledSkills.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggleSkill(skill.id)}
                    className={cn('xv-cba-item', on && 'is-active')} data-tone="purple"
                  >
                    <span className={cn('xv-cba-check', on && 'is-on')} aria-hidden="true">
                      {on && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="xv-cba-item__text">
                      <b>{skill.label}</b>
                      <i>{skill.description}</i>
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {panel === 'rules' && (
            <>
              <div className="xv-cba-head">
                <button type="button" onClick={() => setPanel('menu')} className="xv-cba-back">
                  Back
                </button>
                <span>Rules</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <p className="xv-cba-note">
                Standing instructions added above every prompt. Stored on this device only.
              </p>
              <textarea
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                rows={6}
                spellCheck={false}
                placeholder={'Always use TypeScript strict mode.\nPrefer server components.\nNever add a dependency without asking.'}
                className="xv-cba-textarea"
                aria-label="Standing rules"
              />
              {rules.trim() && (
                <button type="button" className="xv-cba-clear" onClick={() => setRules('')}>
                  Clear rules
                </button>
              )}
            </>
          )}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
