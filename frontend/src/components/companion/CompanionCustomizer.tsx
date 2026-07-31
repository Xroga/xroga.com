'use client';

import { useState } from 'react';
import {
  BatteryCharging,
  Check,
  Fingerprint,
  Gamepad2,
  LayoutGrid,
  Maximize2,
  Mic2,
  Shirt,
  Smile,
} from 'lucide-react';
import { CompanionRenderer } from './CompanionRenderer';
import {
  COMPANION_MOODS,
  companionEnergy,
  validateCompanionName,
  type CompanionAccent,
  type CompanionCostume,
  type CompanionSize,
} from '@/lib/companion';
import { useCompanionStore } from '@/store/useCompanionStore';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Tabs, type TabItem } from '@/components/ui/Tabs';

const COSTUMES: Array<{ id: CompanionCostume; label: string; detail: string; image: string }> = [
  { id: 'coder', label: 'Coder', detail: 'The original hoodie build', image: '/brand/costumes/coder.webp' },
  { id: 'techwear', label: 'Techwear', detail: 'White-plated suit with reactor core', image: '/brand/costumes/techwear.webp' },
  { id: 'mystic-robe', label: 'Mystic', detail: 'Wide-brim hat and arcane robe', image: '/brand/costumes/mystic-robe.webp' },
  { id: 'circuit', label: 'Circuit', detail: 'Wired plating and live traces', image: '/brand/costumes/circuit.webp' },
  { id: 'ninja-neon', label: 'Neon Ninja', detail: 'Hooded blacks with neon trim', image: '/brand/costumes/ninja-neon.webp' },
];
const ACCENTS: CompanionAccent[] = ['blue', 'violet', 'cyan', 'emerald'];
const SIZES: CompanionSize[] = ['compact', 'standard', 'large'];

const GROUPS = [
  { id: 'identity', label: 'Identity', icon: <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'form', label: 'Form', icon: <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'wardrobe', label: 'Skins & Costumes', icon: <Shirt className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'expression', label: 'Expression', icon: <Smile className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'placement', label: 'Placement', icon: <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'behavior', label: 'Behavior', icon: <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'voice', label: 'Sound & Care', icon: <Mic2 className="h-3.5 w-3.5" aria-hidden="true" /> },
] as const satisfies readonly TabItem[];

type GroupId = (typeof GROUPS)[number]['id'];

export function CompanionCustomizer() {
  const state = useCompanionStore();
  const energy = companionEnergy(state);
  const [group, setGroup] = useState<GroupId>('identity');
  const selectedCostume = COSTUMES.find((c) => c.id === state.costume) ?? COSTUMES[0];

  return (
    <section aria-labelledby="companion-settings-title" className="space-y-5">
      <div>
        <p className="text-xs font-bold tracking-[.16em] text-[var(--accent)]">COMPANION STUDIO</p>
        <h2 id="companion-settings-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
          Make the companion yours
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
          Its operational gestures come from real Xroga events. Personality, tone, appearance, and optional care stay under your control and sync to your account.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        {/* Live preview */}
        <div className="flex flex-col items-center gap-2 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <div className="xv-companion-customizer-preview mx-auto" data-size={state.size}>
            <CompanionRenderer
              mood={state.mood}
              operation={state.operation}
              costume={state.costume}
              accent={state.accent}
              crownEnabled={state.crownEnabled}
              mantleEnabled={state.mantleEnabled}
              portraitSrc={selectedCostume.image}
              decorative={false}
            />
          </div>
          <span className="text-xs capitalize text-[var(--text-secondary)]">
            {state.name} · {energy}
          </span>
        </div>

        <div className="min-w-0 space-y-4">
          <Tabs items={GROUPS} activeId={group} onChange={(id) => setGroup(id as GroupId)} orientation="horizontal" idPrefix="xv-companion-group" />

          <div
            role="tabpanel"
            id={`xv-companion-group-panel-${group}`}
            aria-labelledby={`xv-companion-group-${group}`}
            className="space-y-4"
          >
            {group === 'identity' && (
              <div>
                <label htmlFor="companion-name" className="text-xs font-medium text-[var(--text-secondary)]">
                  Companion name
                </label>
                <input
                  id="companion-name"
                  value={state.name}
                  maxLength={24}
                  onChange={(event) => state.updatePreferences({ name: event.target.value })}
                  onBlur={(event) => state.updatePreferences({ name: validateCompanionName(event.target.value) })}
                  className="mt-1.5 w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                />
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">1–24 characters. Saved to your authenticated profile.</p>
              </div>
            )}

            {group === 'form' && (
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)]">Display size</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={state.size === size}
                      onClick={() => state.updatePreferences({ size })}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                        state.size === size
                          ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {group === 'wardrobe' && (
              <div className="space-y-5">
                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Costume</p>
                  <div role="radiogroup" aria-label="Costume" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {COSTUMES.map((costume) => {
                      const equipped = state.costume === costume.id;
                      return (
                        <button
                          key={costume.id}
                          type="button"
                          role="radio"
                          aria-checked={equipped}
                          onClick={() => state.updatePreferences({ costume: costume.id })}
                          className={cn(
                            'relative flex flex-col items-center gap-2 rounded-token-md border p-3 text-center transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                            equipped
                              ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                              : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]',
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={costume.image} alt="" aria-hidden="true" className="h-14 w-auto object-contain" />
                          <span className="text-xs font-medium text-[var(--text-primary)]">{costume.label}</span>
                          <span className="text-[10px] leading-tight text-[var(--text-muted)]">{costume.detail}</span>
                          {equipped && (
                            <Badge tone="accent" className="absolute right-1.5 top-1.5">
                              <Check className="h-2.5 w-2.5" aria-hidden="true" /> Equipped
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Energy accent</p>
                  <div className="xv-companion-accent-row" role="radiogroup" aria-label="Energy accent">
                    {ACCENTS.map((accent) => (
                      <button
                        key={accent}
                        type="button"
                        role="radio"
                        aria-label={`${accent} accent`}
                        aria-checked={state.accent === accent}
                        data-accent={accent}
                        onClick={() => state.updatePreferences({ accent })}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <Switch
                    checked={state.crownEnabled}
                    onChange={(crownEnabled) => state.updatePreferences({ crownEnabled })}
                    label="X crown"
                    description="Keep the protected X-shaped identity crown."
                  />
                  <Switch
                    checked={state.mantleEnabled}
                    onChange={(mantleEnabled) => state.updatePreferences({ mantleEnabled })}
                    label="Adaptive mantle"
                    description="Theme-aware clothing layer that changes with the selected costume."
                  />
                </div>
              </div>
            )}

            {group === 'expression' && (
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)]">Mood preview</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COMPANION_MOODS.map((mood) => (
                    <button
                      key={mood}
                      type="button"
                      aria-pressed={state.mood === mood}
                      onClick={() => state.previewMood(mood)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                        state.mood === mood
                          ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
                      )}
                    >
                      {mood}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {group === 'placement' && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-[var(--text-secondary)]">Workspace position</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      aria-pressed={state.dock === 'composer'}
                      onClick={() => state.updatePreferences({ dock: 'composer' })}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                        state.dock === 'composer'
                          ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
                      )}
                    >
                      Composer
                    </button>
                    <button
                      type="button"
                      aria-pressed={state.dock === 'corner'}
                      onClick={() => state.updatePreferences({ dock: 'corner' })}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                        state.dock === 'corner'
                          ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
                      )}
                    >
                      Corner
                    </button>
                  </div>
                </div>
                <Switch
                  checked={state.visible}
                  onChange={(visible) => state.updatePreferences({ visible })}
                  label="Show companion"
                  description="Visible on the homepage, Workspace composer, and authenticated product surfaces."
                />
              </div>
            )}

            {group === 'behavior' && (
              <Switch
                checked={state.reducedGamification}
                onChange={(reducedGamification) => state.updatePreferences({ reducedGamification })}
                label="Reduced gamification"
                description="Keep the companion professional and disable energy-pressure language."
              />
            )}

            {group === 'voice' && (
              <div>
                <Switch
                  checked={state.voiceEnabled}
                  onChange={(voiceEnabled) => state.updatePreferences({ voiceEnabled })}
                  label="Read replies aloud"
                  description="Speak completed real AI responses only after you opt in. Never auto-enabled."
                />
                <Switch
                  checked={state.careEnabled}
                  onChange={(careEnabled) => state.updatePreferences({ careEnabled })}
                  label="Weekly code energy"
                  description="A gentle weekly care state that never blocks building or hides product status."
                />
                <div className="flex items-center gap-2 pt-2">
                  <BatteryCharging className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                  <span className="text-xs text-[var(--text-muted)]">Current energy: <span className="capitalize">{energy}</span></span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
