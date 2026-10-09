'use client';

/**
 * The right side of the stage (V6 §13–§21, V9 §35–§38): six readable tools for the current job,
 * from the 1,603 available. Units hold authored slots and never wander. A tool is dim until the job
 * uses it, lifts while it is in use, then stays quietly lit. While Xroga works without tools the whole
 * rack recedes, so it is clear the integrations extend Xroga rather than define it.
 */
import { MARKS, type ProviderId } from './providerMarks';
import { Mark } from './Mark';
import { COPY } from './copy';
import s from './Toolset.module.css';

/** Owners' current spelling where the icon set's title differs. */
const DISPLAY: Partial<Record<ProviderId, string>> = { mailchimp: 'Mailchimp', googleads: 'Google Ads', reddit: 'Reddit Ads' };

type UnitState = 'in' | 'out' | 'still';

function Unit({ id, state, i, active, used }: { id: ProviderId; state: UnitState; i: number; active?: boolean; used?: boolean }) {
  const m = MARKS[id];
  const name = DISPLAY[id] ?? m.name;
  return (
    <span
      className={s.unit}
      data-state={state}
      // the signal layer finds its endpoint by this id, the same id the action lights (V12 §12, §16)
      data-provider={state === 'out' ? undefined : id}
      data-active={active || undefined}
      data-used={used || undefined}
      style={{ '--brand': m.hex, '--i': i } as React.CSSProperties}
      tabIndex={state === 'out' ? -1 : 0}
      aria-hidden={state === 'out' || undefined}
      aria-label={state === 'out' ? undefined : `${name}. ${COPY.connect}.`}
    >
      <span className={s.logo}>
        <Mark id={id} className={s.mark} />
      </span>
      <b className={s.name}>{name}</b>
      <i className={s.tick} aria-hidden="true" />
    </span>
  );
}

export function Toolset({
  set,
  prevSet,
  active,
  used,
  count,
}: {
  set: readonly ProviderId[];
  prevSet: readonly ProviderId[] | null;
  active: Set<string>;
  used: Set<string>;
  count: number;
}) {
  const native = used.size === 0 && active.size === 0;
  return (
    <div className={s.rack} data-native={native || undefined} data-count={count}>
      <div className={s.head}>
        <span className={s.title}>{COPY.rackTitle}</span>
        <span className={s.count}>{COPY.rackCount(count)}</span>
      </div>
      <div className={s.grid} data-swapping={prevSet ? set.join() : undefined} role="list">
        {set.slice(0, count).map((id, i) => (
          <div key={i} className={s.slot} role="listitem">
            {prevSet && <Unit key={`out-${prevSet[i]}`} id={prevSet[i]} state="out" i={i} />}
            <Unit key={`${set.join()}-${id}`} id={id} state={prevSet ? 'in' : 'still'} i={i} active={active.has(id)} used={used.has(id)} />
          </div>
        ))}
      </div>
    </div>
  );
}
