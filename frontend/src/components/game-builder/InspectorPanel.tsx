'use client';

import { HudIcon } from './HudIcons';
import type { ScenePreset } from '@/lib/gameCockpitContent';

/**
 * The inspector.
 *
 * Values come from the active preset and the selected scene, so it changes with the
 * rest of the cockpit rather than sitting frozen. "Edit with AI" is wired to the
 * iteration input below the fold — it is a real control that moves focus, not a
 * dead button, which is why it is a `button` and not a styled `div`.
 */
export function InspectorPanel({
  scene,
  sceneName,
  onEditWithAi,
}: {
  scene: ScenePreset;
  sceneName: string;
  onEditWithAi: () => void;
}) {
  const { inspector } = scene;
  // The selected scene shifts the numbers, so switching scenes visibly updates the
  // panel instead of only changing a label.
  const isBoss = /boss|rival|duel/i.test(sceneName);
  const hp = isBoss ? inspector.hp : Math.round(inspector.hp * 0.4);
  const damage = isBoss ? inspector.damage : Math.max(4, Math.round(inspector.damage * 0.6));

  return (
    <section className="xv-gc-panel xv-gc-inspector" aria-labelledby="gc-inspector-title">
      <header className="xv-gc-panel__head">
        <h3 className="xv-gc-panel__title" id="gc-inspector-title">
          Inspector
        </h3>
        <span className="xv-gc-panel__meta">{sceneName}</span>
      </header>

      <p className="xv-gc-inspector__name">{isBoss ? inspector.name : inspector.name.replace('Enemy', 'Minion')}</p>

      <dl className="xv-gc-inspector__stats">
        <div>
          <dt>HP</dt>
          <dd>{hp}</dd>
        </div>
        <div>
          <dt>Damage</dt>
          <dd>{damage}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{inspector.speed}</dd>
        </div>
        <div>
          <dt>Behavior</dt>
          <dd>{isBoss ? inspector.behavior : 'Patrolling'}</dd>
        </div>
      </dl>

      <button type="button" className="xv-gc-btn xv-gc-btn--ai xv-gc-btn--block" onClick={onEditWithAi}>
        <HudIcon name="spark" size={13} />
        Edit with AI
      </button>
    </section>
  );
}
