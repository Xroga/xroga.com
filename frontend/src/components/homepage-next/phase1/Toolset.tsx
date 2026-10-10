'use client';

/**
 * The right side of the stage: one place, three meanings.
 *   TOOLS FOR THIS JOB   six readable tools for an external job. A tool is dim until a step uses it, lifts
 *                        while in use, then stays quietly lit. While Xroga works alone the rack recedes.
 *   RESEARCH SOURCES     public evidence Xroga reads for native research. Sources are read, never "connected".
 *   CLEANUP PLAN         the steps of Xroga's own data work, ticked as Xroga applies them. No provider.
 * When the mode changes the old content leaves as one layer and the new one arrives. Only the incoming layer
 * carries endpoint ids (`data-provider`, `data-source`), so a signal can never reach something that is leaving.
 */
import { Globe } from 'lucide-react';
import { MARKS, type ProviderId } from './providerMarks';
import { Mark } from './Mark';
import { COPY, MODE_TITLE, PLAN, SOURCE_COPY, VALIDATION } from './copy';
import { SOURCE_SET, type RightMode, type SourceId } from './orchestration';
import { SOURCE_MARKS } from './sourceMarks';
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
      // the signal layer finds its endpoint by this id, the same id the action lights
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

function SourceMark({ id }: { id: SourceId }) {
  if (id === 'web') return <Globe className={`${s.mark} ${s.stroke}`} strokeWidth={1.8} aria-hidden="true" />;
  return (
    <svg className={s.mark} viewBox="0 0 24 24" aria-hidden="true">
      <path d={SOURCE_MARKS[id].d} />
    </svg>
  );
}

function Source({ id, i, live, reading, found }: { id: SourceId; i: number; live: boolean; reading?: boolean; found?: boolean }) {
  const c = SOURCE_COPY[id];
  const brand = id === 'web' ? '#c9ccd4' : SOURCE_MARKS[id].hex;
  return (
    <span
      className={s.unit}
      data-kind="source"
      data-state={live ? 'in' : 'out'}
      data-source={live ? id : undefined}
      data-active={reading || undefined}
      data-used={found || undefined}
      style={{ '--brand': brand, '--i': i } as React.CSSProperties}
      aria-hidden={!live || undefined}
      aria-label={live ? `${c.name}. ${found ? c.found : c.idle}.` : undefined}
    >
      <span className={s.logo}>
        <SourceMark id={id} />
      </span>
      <span className={s.label}>
        <b className={s.name}>{c.name}</b>
        <small key={found ? 'found' : 'idle'} className={s.sub}>
          {found ? c.found : c.idle}
        </small>
      </span>
      <i className={s.tick} aria-hidden="true" />
    </span>
  );
}

function Plan({ live, effects, mobile }: { live: boolean; effects: Set<string>; mobile: boolean }) {
  const shown = effects.has('found') || !live;
  const current = PLAN.findIndex((p) => !effects.has(p.fx));
  const valid = effects.has('validated');
  if (mobile) {
    // phones: one readable line with the change Xroga is applying, never four squeezed rows
    const row = PLAN[current < 0 ? PLAN.length - 1 : current];
    const done = current < 0 ? PLAN.length : current;
    return (
      <div className={s.planLine} data-state={live ? 'in' : 'out'} aria-hidden={!live || undefined}>
        {shown &&
          (valid ? (
            <span key="valid">{VALIDATION.result}</span>
          ) : (
            <>
              <span key={row.fx}>
                {row.from} <i aria-hidden="true">→</i> {row.to}
              </span>
              <em>
                {done}/{PLAN.length}
              </em>
            </>
          ))}
      </div>
    );
  }
  return (
    <div className={s.planWrap} data-state={live ? 'in' : 'out'} aria-hidden={!live || undefined}>
      <ol className={s.plan}>
        {PLAN.map((p, i) => {
          const done = effects.has(p.fx);
          const on = live && shown && i === current;
          const state = done ? ('review' in p ? 'review' : 'done') : on ? 'on' : 'todo';
          return (
            <li key={p.fx} data-shown={shown || undefined} data-state={state} style={{ '--i': i } as React.CSSProperties}>
              <i className={s.node} aria-hidden="true" />
              <span className={s.planBody}>
                <small>{p.kind}</small>
                <b>
                  <span className={s.from}>{p.from}</span>
                  <span className={s.arrow} aria-hidden="true">→</span>
                  <span className={s.to}>{p.to}</span>
                </b>
                <em>{p.note}</em>
              </span>
            </li>
          );
        })}
      </ol>
      {valid && live && (
        <p className={s.validation}>
          {VALIDATION.checks.map((c) => (
            <span key={c}>{c}</span>
          ))}
          <b>{VALIDATION.result}</b>
        </p>
      )}
    </div>
  );
}

function Content({
  mode,
  live,
  set,
  prevSet,
  active,
  used,
  reading,
  found,
  effects,
  count,
}: {
  mode: RightMode;
  live: boolean;
  set: readonly ProviderId[];
  prevSet: readonly ProviderId[] | null;
  active: Set<string>;
  used: Set<string>;
  reading: Set<string>;
  found: Set<string>;
  effects: Set<string>;
  count: number;
}) {
  if (mode === 'plan') return <Plan live={live} effects={live ? effects : new Set()} mobile={count === 3} />;
  if (mode === 'sources') {
    const shown = SOURCE_SET.slice(0, count === 3 ? 3 : 4);
    return (
      <div className={s.grid} data-mode="sources" role={live ? 'list' : undefined}>
        {shown.map((id, i) => (
          <div key={id} className={s.slot} role={live ? 'listitem' : undefined}>
            <Source id={id} i={i} live={live} reading={live && reading.has(id)} found={live && found.has(id)} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={s.grid} data-swapping={live && prevSet ? set.join() : undefined} role={live ? 'list' : undefined}>
      {set.slice(0, count).map((id, i) => (
        <div key={i} className={s.slot} role={live ? 'listitem' : undefined}>
          {live && prevSet && <Unit key={`out-${prevSet[i]}`} id={prevSet[i]} state="out" i={i} />}
          <Unit
            key={`${set.join()}-${id}`}
            id={id}
            state={!live ? 'out' : prevSet ? 'in' : 'still'}
            i={i}
            active={live && active.has(id)}
            used={live && used.has(id)}
          />
        </div>
      ))}
    </div>
  );
}

export function Toolset({
  mode,
  prevMode,
  set,
  prevSet,
  active,
  used,
  reading,
  found,
  effects,
  count,
}: {
  mode: RightMode;
  prevMode: RightMode | null;
  set: readonly ProviderId[];
  prevSet: readonly ProviderId[] | null;
  active: Set<string>;
  used: Set<string>;
  reading: Set<string>;
  found: Set<string>;
  effects: Set<string>;
  count: number;
}) {
  const quiet = mode === 'tools' && used.size === 0 && active.size === 0;
  const common = { set, active, used, reading, found, effects, count };
  return (
    <div className={s.rack} data-native={quiet || undefined} data-mode={mode} data-count={count}>
      <div className={s.head}>
        <span key={mode} className={s.title} data-changing={prevMode ? '' : undefined}>
          {MODE_TITLE[mode]}
        </span>
      </div>
      <div className={s.body}>
        {/* the outgoing mode leaves as one layer with no endpoint ids; it is gone once the swap ends */}
        {prevMode && (
          <div key={`out-${prevMode}`} className={s.layer} data-phase="out">
            <Content {...common} mode={prevMode} live={false} prevSet={null} set={prevSet ?? []} />
          </div>
        )}
        <div key={`in-${mode}`} className={s.layer} data-phase={prevMode ? 'in' : undefined}>
          <Content {...common} mode={mode} live prevSet={prevMode ? null : prevSet} />
        </div>
      </div>
    </div>
  );
}
