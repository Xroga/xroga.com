'use client';

import { BatteryCharging, Crown, Eye, Gamepad2, Mic2, Shirt, Sparkles } from 'lucide-react';
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

const COSTUMES: Array<{ id: CompanionCostume; label: string; detail: string }> = [
  { id: 'core', label: 'Core', detail: 'Compact guardian silhouette' },
  { id: 'builder', label: 'Builder', detail: 'Structured tool-ready frame' },
  { id: 'navigator', label: 'Navigator', detail: 'Rounded guidance silhouette' },
];
const ACCENTS: CompanionAccent[] = ['blue', 'violet', 'cyan', 'emerald'];
const SIZES: CompanionSize[] = ['compact', 'standard', 'large'];

function Toggle({ label, detail, checked, onChange, icon }: { label: string; detail: string; checked: boolean; onChange: (checked: boolean) => void; icon: React.ReactNode }) {
  return (
    <label className="xv-companion-toggle">
      <span className="xv-companion-toggle-icon">{icon}</span>
      <span><strong>{label}</strong><small>{detail}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export function CompanionCustomizer() {
  const state = useCompanionStore();
  const energy = companionEnergy(state);
  return (
    <section className="xv-companion-customizer" aria-labelledby="companion-settings-title">
      <div className="xv-companion-customizer-intro">
        <div>
          <p className="text-xs font-bold tracking-[.16em] text-[var(--accent)]">LIVING X-COMPANION</p>
          <h2 id="companion-settings-title" className="text-xl font-semibold mt-1">Make the companion yours</h2>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Its operational gestures come from real Xroga events. Personality, voice, appearance, and optional care stay under your control and sync to your account.
          </p>
        </div>
        <div className="xv-companion-customizer-preview" data-size={state.size}>
          <CompanionRenderer
            mood={state.mood}
            operation={state.operation}
            costume={state.costume}
            accent={state.accent}
            crownEnabled={state.crownEnabled}
            mantleEnabled={state.mantleEnabled}
            decorative={false}
          />
          <span>{state.name} · {energy}</span>
        </div>
      </div>

      <div className="xv-companion-settings-grid">
        <div className="xv-companion-setting-card">
          <label htmlFor="companion-name">Companion name</label>
          <input
            id="companion-name"
            value={state.name}
            maxLength={24}
            onChange={(event) => state.updatePreferences({ name: event.target.value })}
            onBlur={(event) => state.updatePreferences({ name: validateCompanionName(event.target.value) })}
          />
          <small>1–24 characters. Saved to your authenticated profile.</small>
        </div>

        <fieldset className="xv-companion-setting-card">
          <legend><Shirt className="h-4 w-4" /> Silhouette</legend>
          <div className="xv-companion-choice-grid">
            {COSTUMES.map((costume) => (
              <button key={costume.id} type="button" className={cn(state.costume === costume.id && 'is-active')} onClick={() => state.updatePreferences({ costume: costume.id })}>
                <strong>{costume.label}</strong><small>{costume.detail}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="xv-companion-setting-card">
          <legend><Sparkles className="h-4 w-4" /> Energy accent</legend>
          <div className="xv-companion-accent-row">
            {ACCENTS.map((accent) => (
              <button key={accent} type="button" aria-label={`${accent} accent`} aria-pressed={state.accent === accent} data-accent={accent} onClick={() => state.updatePreferences({ accent })} />
            ))}
          </div>
        </fieldset>

        <fieldset className="xv-companion-setting-card">
          <legend><Eye className="h-4 w-4" /> Mood preview</legend>
          <div className="xv-companion-mood-row">
            {COMPANION_MOODS.map((mood) => (
              <button key={mood} type="button" className={cn(state.mood === mood && 'is-active')} onClick={() => state.previewMood(mood)}>{mood}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="xv-companion-setting-card">
          <legend>Display size</legend>
          <div className="xv-companion-mood-row">
            {SIZES.map((size) => (
              <button key={size} type="button" className={cn(state.size === size && 'is-active')} onClick={() => state.updatePreferences({ size })}>{size}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="xv-companion-setting-card">
          <legend>Workspace position</legend>
          <div className="xv-companion-mood-row">
            <button type="button" className={cn(state.dock === 'composer' && 'is-active')} onClick={() => state.updatePreferences({ dock: 'composer' })}>Composer</button>
            <button type="button" className={cn(state.dock === 'corner' && 'is-active')} onClick={() => state.updatePreferences({ dock: 'corner' })}>Corner</button>
          </div>
        </fieldset>
      </div>

      <div className="xv-companion-toggle-list">
        <Toggle label="Show companion" detail="Visible on the homepage, Workspace composer, and authenticated product surfaces." checked={state.visible} onChange={(visible) => state.updatePreferences({ visible })} icon={<Eye className="h-4 w-4" />} />
        <Toggle label="X crown" detail="Keep the protected X-shaped identity crown." checked={state.crownEnabled} onChange={(crownEnabled) => state.updatePreferences({ crownEnabled })} icon={<Crown className="h-4 w-4" />} />
        <Toggle label="Adaptive mantle" detail="Theme-aware clothing layer that changes with the selected silhouette." checked={state.mantleEnabled} onChange={(mantleEnabled) => state.updatePreferences({ mantleEnabled })} icon={<Shirt className="h-4 w-4" />} />
        <Toggle label="Optional voice" detail="Speak completed real AI responses only after you opt in. Never auto-enabled." checked={state.voiceEnabled} onChange={(voiceEnabled) => state.updatePreferences({ voiceEnabled })} icon={<Mic2 className="h-4 w-4" />} />
        <Toggle label="Weekly code energy" detail="A gentle weekly care state that never blocks building or hides product status." checked={state.careEnabled} onChange={(careEnabled) => state.updatePreferences({ careEnabled })} icon={<BatteryCharging className="h-4 w-4" />} />
        <Toggle label="Reduced gamification" detail="Keep the companion professional and disable energy-pressure language." checked={state.reducedGamification} onChange={(reducedGamification) => state.updatePreferences({ reducedGamification })} icon={<Gamepad2 className="h-4 w-4" />} />
      </div>
    </section>
  );
}
