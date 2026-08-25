'use client';

import { useEffect, useRef, useState } from 'react';
import { Blocks, Bug, Check, ChevronRight, ListChecks, Paperclip, ScrollText, SlashSquare, Sparkles, X } from 'lucide-react';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { CirclePlayIcon } from '@/components/icons/animated/CirclePlayIcon';
import {
  COMPOSER_PRESETS,
  COMPOSER_SKILLS,
  buildComposerPreamble,
  useComposerToolsStore,
} from '@/store/useComposerToolsStore';
import { cn } from '@/lib/utils';

/**
 * The composer's extra actions, behind one compact trigger.
 *
 * The toolbar was already at capacity — Black Hole, integrations, GitHub, Vercel, and
 * it scrolls horizontally on a phone. Adding four more chips inline would have made
 * the bar unusable, which is exactly what you asked me to avoid. One `+` opens a menu
 * instead, so the resting bar gains a single 28px control.
 *
 * A dot on the trigger marks that rules or packs are active, because a prompt being
 * silently modified is worse than no feature at all.
 */
export function ChatBarActionsMenu({
  onInsert,
  onAddFiles,
  onOpenConnectors,
  onOpenIntegrations,
  connectorsNeedingAttention = 0,
  disabled,
  className,
}: {
  /** Fills the composer with a scaffold for the user to edit. Never auto-sends. */
  onInsert: (text: string) => void;
  onAddFiles?: () => void;
  onOpenConnectors?: () => void;
  /**
   * Opens the integrations surface. This used to be a pill sitting beside the `+`,
   * which read as a second, competing entry point to the same dialog; it is a menu
   * row now, and the pill is gone.
   */
  onOpenIntegrations?: () => void;
  /** Drives the "n needs reconnection" note. 0 means everything is connected. */
  connectorsNeedingAttention?: number;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<'menu' | 'skills' | 'rules'>('menu');
  const rootRef = useRef<HTMLDivElement>(null);

  const rules = useComposerToolsStore((s) => s.rules);
  const setRules = useComposerToolsStore((s) => s.setRules);
  const enabledSkills = useComposerToolsStore((s) => s.enabledSkills);
  const toggleSkill = useComposerToolsStore((s) => s.toggleSkill);

  const activeCount = enabledSkills.length + (rules.trim() ? 1 : 0);
  const preamble = buildComposerPreamble(rules, enabledSkills);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  // Always reopen on the menu — landing back inside the rules editor after a close
  // is disorienting when the trigger looks like a single generic button.
  useEffect(() => {
    if (!open) setPanel('menu');
  }, [open]);

  function insert(text: string) {
    onInsert(text);
    setOpen(false);
  }

  return (
    /* Deliberately not a positioning context. The menu is anchored to the composer
       surface itself so it can sit flush against its top edge with no gap; anchoring
       it here would pin it to a 28px button in the middle of the composer's bottom
       row, which is what made it read as a detached popup. */
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
        title="Plan, debug, skills, and rules"
      >
        {/* The ring draws itself and the symbol lands inside it. The 45deg turn that
            marked the open state came from the plus reading as a close cross when
            rotated; this glyph is not a cross, so the open state is carried by
            `data-open` in the stylesheet instead. */}
        <AnimatedIcon icon={CirclePlayIcon} size={14} />
        {activeCount > 0 && <span className="xv-cba-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="xv-cba-menu" role="dialog" aria-label="Composer actions">
          {panel === 'menu' && (
            /* A two-column grid from `sm` up. As one tall column this list ran to
               roughly three times its own width, which is what made it feel like a
               page rather than a menu. Only the root list is laid out this way — the
               Skills and Rules panels below stay single-column, because their rows
               are toggles in a set rather than independent destinations. */
            <div className="xv-cba-grid">
              {/* Attach and connectors come first: they are what a `+` means in a
                  composer, and folding them in here is what let the toolbar row of
                  GitHub / Vercel / Integrations chips above the input go away. */}
              {onAddFiles && (
                <button type="button" className="xv-cba-item" onClick={() => { onAddFiles(); setOpen(false); }}>
                  <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="xv-cba-item__text">
                    <b>Add files or photos</b>
                  </span>
                  <kbd className="xv-cba-kbd">Ctrl+U</kbd>
                </button>
              )}

              <button type="button" className="xv-cba-item" onClick={() => insert('/')}>
                <SlashSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text">
                  <b>Slash commands</b>
                </span>
              </button>

              {onOpenConnectors && (
                <button type="button" className="xv-cba-item" onClick={() => { onOpenConnectors(); setOpen(false); }}>
                  <Blocks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="xv-cba-item__text">
                    <b>Connectors</b>
                  </span>
                  {connectorsNeedingAttention > 0 && (
                    <span className="xv-cba-hint">
                      {connectorsNeedingAttention} needs reconnection
                    </span>
                  )}
                  <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
                </button>
              )}

              <div className="xv-cba-sep" role="separator" />

              <button type="button" className="xv-cba-item" onClick={() => insert(COMPOSER_PRESETS.plan)}>
                <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text">
                  <b>Plan before build</b>
                  <i>Get the approach first, change nothing yet</i>
                </span>
              </button>

              <button type="button" className="xv-cba-item" onClick={() => insert(COMPOSER_PRESETS.debug)}>
                <Bug className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text">
                  <b>Debug an error</b>
                  <i>Paste the error, get the root cause</i>
                </span>
              </button>

              <div className="xv-cba-sep" role="separator" />

              <button type="button" className="xv-cba-item" onClick={() => setPanel('skills')}>
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text">
                  <b>Skills</b>
                  <i>
                    {enabledSkills.length > 0
                      ? `${enabledSkills.length} active`
                      : 'Reusable instruction packs'}
                  </i>
                </span>
              </button>

              <button type="button" className="xv-cba-item" onClick={() => setPanel('rules')}>
                <ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="xv-cba-item__text">
                  <b>Rules</b>
                  <i>{rules.trim() ? 'Applied to every prompt' : 'Standing instructions you write'}</i>
                </span>
              </button>

              {onOpenIntegrations && (
                <>
                  <div className="xv-cba-sep" role="separator" />
                  {/* Full width: its description is a list of accounts, which wraps to
                      three lines in half a row and drags the whole grid taller. */}
                  <button
                    type="button"
                    className="xv-cba-item xv-cba-item--wide"
                    onClick={() => {
                      onOpenIntegrations();
                      setOpen(false);
                    }}
                  >
                    <Blocks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="xv-cba-item__text">
                      <b>Integrations</b>
                      <i>GitHub, Vercel, and the rest of your authorised accounts</i>
                    </span>
                    {connectorsNeedingAttention > 0 && <i className="xv-cba-flag" aria-hidden="true" />}
                  </button>
                </>
              )}

              {/* The user sees exactly what gets attached. A prompt silently rewritten
                  behind the composer is the failure mode this avoids. */}
              {preamble && (
                <p className="xv-cba-note xv-cba-item--wide">
                  {activeCount} {activeCount === 1 ? 'instruction is' : 'instructions are'} added
                  above every prompt you send.
                </p>
              )}
            </div>
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
                    className={cn('xv-cba-item', on && 'is-active')}
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
        </div>
      )}
    </div>
  );
}
