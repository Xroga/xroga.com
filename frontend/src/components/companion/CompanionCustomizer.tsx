'use client';

import { useState } from 'react';
import { Check, Maximize2, Shirt } from 'lucide-react';
import { CompanionRenderer } from './CompanionRenderer';
import { type CompanionCostume, type CompanionSize } from '@/lib/companion';
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
const SIZES: CompanionSize[] = ['compact', 'standard', 'large'];

const GROUPS = [
  { id: 'appearance', label: 'Appearance', icon: <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'wardrobe', label: 'Skins & Costumes', icon: <Shirt className="h-3.5 w-3.5" aria-hidden="true" /> },
] as const satisfies readonly TabItem[];

type GroupId = (typeof GROUPS)[number]['id'];

export function CompanionCustomizer() {
  const state = useCompanionStore();
  const [group, setGroup] = useState<GroupId>('appearance');
  const selectedCostume = COSTUMES.find((costume) => costume.id === state.costume) ?? COSTUMES[0];

  return (
    <section aria-labelledby="companion-settings-title" className="space-y-5">
      <div>
        <p className="text-xs font-bold tracking-[.16em] text-[var(--accent)]">COMPANION STUDIO</p>
        <h2 id="companion-settings-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
          Make the companion yours
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
          Its operational gestures come from real Xroga events. Choose the appearance and display size that suit your workspace.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-2 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <div className="xv-companion-customizer-preview mx-auto" data-size={state.size}>
            <CompanionRenderer
              mood={state.mood}
              operation={state.operation}
              costume={state.costume}
              accent={state.accent}
              mantleEnabled={state.mantleEnabled}
              portraitSrc={selectedCostume.image}
              decorative={false}
            />
          </div>
          <span className="text-xs text-[var(--text-secondary)]">Smoky · {selectedCostume.label}</span>
        </div>

        <div className="min-w-0 space-y-4">
          <Tabs items={GROUPS} activeId={group} onChange={(id) => setGroup(id as GroupId)} orientation="horizontal" idPrefix="xv-companion-group" />

          <div role="tabpanel" id={`xv-companion-group-panel-${group}`} aria-labelledby={`xv-companion-group-${group}`} className="space-y-4">
            {group === 'appearance' && (
              <div className="space-y-4">
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
                <Switch
                  checked={state.visible}
                  onChange={(visible) => state.updatePreferences({ visible })}
                  label="Show companion"
                  description="Visible on the homepage, Workspace composer, and authenticated product surfaces."
                />
              </div>
            )}

            {group === 'wardrobe' && (
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
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
