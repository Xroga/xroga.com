import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Composer tools: standing rules and reusable instruction packs.
 *
 * Both work by prefixing the outgoing prompt, which is deliberate and is the whole
 * reason they can be trusted. There is no backend field for custom instructions, so
 * anything that claimed to configure the agent out of band would be decorative — a
 * toggle that changes nothing. Prefixing the prompt is the one mechanism that
 * genuinely reaches the model, so that is what these do, and the composer shows the
 * user exactly what is attached before they send.
 */

/** A reusable instruction pack. Applied by prefixing its text to the prompt. */
export type ComposerSkill = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly instruction: string;
};

export const COMPOSER_SKILLS: readonly ComposerSkill[] = [
  {
    id: 'plan-first',
    label: 'Plan before build',
    description: 'Produce a bounded plan and wait for approval before changing files.',
    instruction:
      'Before changing any file, produce a short plan: what you will change, which files, and how you will verify it. Wait for my approval before implementing.',
  },
  {
    id: 'tests-first',
    label: 'Tests with every change',
    description: 'Every behaviour change ships with a test that fails without it.',
    instruction:
      'Every behaviour change must ship with a test that fails without the change. State which tests you ran and their result.',
  },
  {
    id: 'small-diffs',
    label: 'Minimal diffs',
    description: 'Touch only what the task needs; leave unrelated code alone.',
    instruction:
      'Keep the diff minimal. Do not reformat, rename, or refactor code unrelated to the task, and leave working code intact.',
  },
  {
    id: 'explain-why',
    label: 'Explain the why',
    description: 'Say why each non-obvious decision was made, not just what changed.',
    instruction:
      'For each non-obvious decision, state why you made it and what you rejected. Report failures and blockers plainly rather than working around them silently.',
  },
  {
    id: 'a11y',
    label: 'Accessible by default',
    description: 'Keyboard reachable, labelled, and contrast-checked.',
    instruction:
      'All interactive UI must be keyboard reachable and labelled for assistive technology, and text must meet WCAG AA contrast. State the contrast figures you checked.',
  },
  {
    id: 'no-secrets',
    label: 'Never expose secrets',
    description: 'Keep keys server-side and out of the client bundle.',
    instruction:
      'Never place API keys, tokens, or service-role credentials in client code or commit them. Keep them server-side and reference them by name only.',
  },
];

/** Prompt scaffolds. These fill the composer for the user to edit, never auto-send. */
export const COMPOSER_PRESETS = {
  plan: 'Plan this before building — tell me the approach, the files you would touch, and how you would verify it. Do not change anything yet.\n\n',
  debug: 'Debug this error. Here is what I am seeing:\n\n```\n\n```\n\nFind the root cause rather than suppressing the symptom, and tell me what actually broke.\n\n',
} as const;

interface ComposerToolsState {
  /** Free-text standing rules the user writes. Empty means none are applied. */
  rules: string;
  /** Ids of the enabled packs, in `COMPOSER_SKILLS`. */
  enabledSkills: string[];
  setRules: (rules: string) => void;
  toggleSkill: (id: string) => void;
  clearSkills: () => void;
}

export const useComposerToolsStore = create<ComposerToolsState>()(
  persist(
    (set) => ({
      rules: '',
      enabledSkills: [],
      setRules: (rules) => set({ rules }),
      toggleSkill: (id) =>
        set((s) => ({
          enabledSkills: s.enabledSkills.includes(id)
            ? s.enabledSkills.filter((x) => x !== id)
            : [...s.enabledSkills, id],
        })),
      clearSkills: () => set({ enabledSkills: [] }),
    }),
    {
      name: 'xroga-composer-tools',
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch {
            /* quota or privacy mode — the tools just do not persist */
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            /* ignore */
          }
        },
      })),
      onRehydrateStorage: () => (state) => {
        // A pack id can go stale if the catalogue changes under a persisted value.
        if (!state) return;
        const known = new Set(COMPOSER_SKILLS.map((s) => s.id));
        state.enabledSkills = (state.enabledSkills ?? []).filter((id) => known.has(id));
      },
    },
  ),
);

/**
 * Build the preamble attached to a prompt, or an empty string when nothing is on.
 *
 * Exported and pure so the behaviour is testable without a browser, and so the
 * composer can show the user the exact text that will be attached.
 */
export function buildComposerPreamble(rules: string, enabledSkills: readonly string[]): string {
  const parts: string[] = [];

  const packs = COMPOSER_SKILLS.filter((s) => enabledSkills.includes(s.id));
  for (const pack of packs) parts.push(pack.instruction);

  const trimmed = rules.trim();
  if (trimmed) parts.push(trimmed);

  if (parts.length === 0) return '';
  return `${parts.join('\n')}\n\n---\n\n`;
}
