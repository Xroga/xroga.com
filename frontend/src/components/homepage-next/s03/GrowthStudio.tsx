'use client';

/**
 * S03.B — Launch, Campaigns & Growth Studio. A warmer creative atelier: the job on the left (launch, search ads, social
 * ads, conversions), the work itself in the middle, and the few settings that job needs on the right, with the
 * providers it runs through. A slim ribbon under the stage ties each campaign to the customers it brings in.
 */
import type { Dispatch } from 'react';
import { MISSIONS, channelOf, fmt, type Mission } from './data';
import { LaunchControls, LaunchStage } from './growth/Launch';
import { PathsControls, PathsStage } from './growth/Paths';
import { SearchAdsControls, SearchAdsStage } from './growth/SearchAds';
import { SocialControls, SocialStage } from './growth/Social';
import { rovingKeys } from './keys';
import type { Action, State } from './state';
import { ToolChip } from './ui';
import s from './S03.module.css';

const ROLE: Record<Mission, Record<string, string>> = {
  launch: { ga: 'Launch events', gtm: 'Purchase tag' },
  search: { gads: 'Campaign & ad groups', semrush: 'Keyword demand' },
  social: { meta: 'Audiences & placements' },
  paths: { ga: 'Conversions by source', gtm: 'Event tags', hubspot: 'Leads & follow-up' },
};
/** the channel each campaign feeds, for the ribbon under the stage */
const FEEDS: Record<Mission, string> = { launch: 'email', search: 'search', social: 'social', paths: 'search' };

export function GrowthStudio({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const m = MISSIONS.find((x) => x.id === st.mission)!;
  const ch = channelOf(FEEDS[st.mission]);
  return (
    <div id="s03-growth" className={s.chapter} data-chapter="growth">
      <div className={s.atelier} data-mission={st.mission}>
        <div className={s.missions} role="tablist" aria-orientation="vertical" aria-label="Growth work" onKeyDown={rovingKeys}>
          {MISSIONS.map((x, i) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              id={`s03-mission-${x.id}`}
              aria-selected={x.id === st.mission}
              aria-controls="s03-mission-panel"
              tabIndex={x.id === st.mission ? 0 : -1}
              className={s.mission}
              data-mission={x.id}
              onClick={() => dispatch({ type: 'mission', mission: x.id })}
            >
              <em aria-hidden="true">{String(i + 1).padStart(2, '0')}</em>
              <span>
                {x.label}
                <small>{x.line}</small>
              </span>
            </button>
          ))}
        </div>

        <div className={s.atelierPanes}>
        <div id="s03-mission-panel" role="tabpanel" aria-labelledby={`s03-mission-${st.mission}`} className={s.atelierMain}>
          <div className={s.canvas} data-mission={st.mission}>
            <div key={st.mission} className={s.scene}>
              {st.mission === 'launch' && <LaunchStage st={st} dispatch={dispatch} />}
              {st.mission === 'search' && <SearchAdsStage st={st} dispatch={dispatch} />}
              {st.mission === 'social' && <SocialStage st={st} dispatch={dispatch} />}
              {st.mission === 'paths' && <PathsStage st={st} dispatch={dispatch} />}
            </div>
          </div>
          {st.mission !== 'paths' && (
            <button type="button" className={s.ribbon} onClick={() => dispatch({ type: 'set', patch: { mission: 'paths', channel: ch.id, detail: null } })}>
              <span className={s.ribbonLabel}>{ch.name}</span>
              <span className={s.ribbonFlow} aria-hidden="true">
                <i />
              </span>
              <span>
                <b>{fmt(ch.flow[0])}</b> visits
              </span>
              <span>
                <b>{fmt(ch.flow[1])}</b> trials
              </span>
              <span>
                <b>{fmt(ch.flow[2])}</b> subscribers
              </span>
              <span className={s.ribbonGo}>Trace a conversion</span>
            </button>
          )}
        </div>

        <aside className={s.controls} aria-label={`${m.label} settings`}>
          <div className={s.ctlTools}>
            {m.tools.map((id) => (
              <ToolChip key={id} id={id} role={ROLE[st.mission][id]} chapter="growth" st={st} dispatch={dispatch} />
            ))}
          </div>
          <div key={st.mission} className={s.ctlBody}>
            {st.mission === 'launch' && <LaunchControls st={st} dispatch={dispatch} />}
            {st.mission === 'search' && <SearchAdsControls st={st} dispatch={dispatch} />}
            {st.mission === 'social' && <SocialControls st={st} dispatch={dispatch} />}
            {st.mission === 'paths' && <PathsControls st={st} dispatch={dispatch} />}
          </div>
        </aside>
        </div>
      </div>
    </div>
  );
}
