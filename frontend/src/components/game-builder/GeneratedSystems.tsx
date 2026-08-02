import { GENERATED_SYSTEMS } from '@/lib/gameCockpitContent';
import { HudIcon } from './HudIcons';

/**
 * The loadout panel: one request, eight systems.
 *
 * A server component — it is a static grid with no state, so it costs the route no
 * client JavaScript. Presented as an engine loadout (icon over a short label, tight
 * grid, hairline dividers) rather than eight interchangeable feature cards.
 */
export function GeneratedSystems() {
  return (
    <section className="xv-gc-panel xv-gc-loadout" aria-labelledby="gc-loadout-title">
      <header className="xv-gc-panel__head">
        <h2 className="xv-gc-panel__title" id="gc-loadout-title">
          <span className="xv-gc-panel__index">2.</span> One prompt, complete systems
        </h2>
      </header>

      <ul className="xv-gc-loadout__grid">
        {GENERATED_SYSTEMS.map((system) => (
          <li key={system.id} className="xv-gc-loadout__cell">
            <span className="xv-gc-loadout__icon">
              <HudIcon name={system.id} size={20} />
            </span>
            <span className="xv-gc-loadout__name">{system.title}</span>
            <span className="xv-gc-loadout__body">{system.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
