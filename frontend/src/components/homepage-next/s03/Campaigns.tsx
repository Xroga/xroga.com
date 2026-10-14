'use client';

/**
 * Step 3, Campaigns: one idea, three channel formats. The chosen format stands forward at full size; the other two
 * stay in the scene, turned away at depth, and step forward when chosen. The audience changes the artwork, the line
 * and the offer in every format at once. Everything here is a draft held for review: nothing is published or spent.
 */
import type { Dispatch } from 'react';
import { Artwork, AurelMark } from './Artifact';
import { APPROVALS, AUDIENCES, CHANNELS, PRODUCT, QUERY, audienceOf, type Audience, type Channel } from './data';
import { rovingKeys } from './keys';
import { ToolMark } from './marks';
import type { Action, State } from './state';
import s from './S03.module.css';

const ORDER: Channel[] = CHANNELS.map((c) => c.id);

export function Campaigns({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const a = audienceOf(st.audience);
  const i = ORDER.indexOf(st.channel);
  const pos = (c: Channel) => {
    const d = (ORDER.indexOf(c) - i + ORDER.length) % ORDER.length;
    return d === 0 ? 'front' : d === 1 ? 'right' : 'left';
  };
  return (
    <div className={s.campaigns} data-art={a.art}>
      <div className={s.deck}>
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={s.creative}
            data-channel={c.id}
            data-pos={pos(c.id)}
            onClick={() => dispatch({ type: 'channel', id: c.id })}
          >
            <Creative channel={c.id} a={a} />
          </button>
        ))}
      </div>

      <div className={s.brief}>
        <div className={s.ctl}>
          <span className={s.label}>Audience</span>
          <div className={s.segment} role="radiogroup" aria-label="Audience" onKeyDown={rovingKeys}>
            {AUDIENCES.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={x.id === a.id}
                tabIndex={x.id === a.id ? 0 : -1}
                onClick={() => dispatch({ type: 'audience', id: x.id })}
              >
                {x.name}
              </button>
            ))}
          </div>
        </div>
        <div className={s.ctl}>
          <span className={s.label}>Channel</span>
          <div className={s.segment} role="radiogroup" aria-label="Channel" onKeyDown={rovingKeys}>
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={st.channel === c.id}
                tabIndex={st.channel === c.id ? 0 : -1}
                onClick={() => dispatch({ type: 'channel', id: c.id })}
              >
                <ToolMark id={c.provider} size={14} />
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <p className={s.sr} aria-live="polite">
          {CHANNELS[i].format} for {a.name}: {a.headline}
        </p>
      </div>

      <div className={s.review}>
        <span className={s.status} data-ready={st.ready || undefined}>
          <i aria-hidden="true" />
          {st.ready ? 'Ready for review' : 'Draft · $0 spent'}
        </span>
        <button
          type="button"
          className={s.quietBtn}
          aria-expanded={st.detail === 'approvals'}
          onClick={() => dispatch({ type: 'detail', detail: st.detail === 'approvals' ? null : 'approvals' })}
        >
          Review before launch
        </button>
        {st.detail === 'approvals' && (
          <div className={s.sheet} role="group" aria-label="Approvals this campaign would need">
            <p className={s.sheetTitle}>Nothing goes live until you approve:</p>
            <ul className={s.checks}>
              {APPROVALS.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <div className={s.sheetRow}>
              <button type="button" className={s.solidBtn} aria-pressed={st.ready} onClick={() => dispatch({ type: 'ready' })}>
                {st.ready ? 'Undo' : 'Approval step preview'}
              </button>
              <span className={s.sheetNote}>Nothing is published, sent or spent from this page.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Creative({ channel, a }: { channel: Channel; a: Audience }) {
  if (channel === 'search')
    return (
      <span className={s.adSearch}>
        <span className={s.adQuery}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          {QUERY}
        </span>
        <span className={s.adResult}>
          <span className={s.adTop}>
            <b>Sponsored</b>
            <span className={s.adFav}>
              <AurelMark size={11} />
            </span>
            {PRODUCT.domain}
          </span>
          <span className={s.adHead}>{a.search.title}</span>
          <span className={s.adText}>{a.search.text}</span>
          <span className={s.adLinks}>
            <span>Pricing</span>
            <span>How sessions work</span>
            <span>{a.offer}</span>
          </span>
        </span>
        <span key={a.id} className={s.adThumb}>
          <Artwork art={a.art} />
        </span>
      </span>
    );
  if (channel === 'social')
    return (
      <span className={s.adSocial}>
        <span className={s.socialTop}>
          <span className={s.avatar}>
            <AurelMark size={13} />
          </span>
          <b>{PRODUCT.name}</b>
          <small>Sponsored</small>
        </span>
        <span key={a.id} className={s.socialArt}>
          <Artwork art={a.art} />
          <b>{a.headline}</b>
        </span>
        <span className={s.socialFoot}>
          <span>
            <small>{PRODUCT.domain}</small>
            {a.offer}
          </span>
          <span className={s.fakeCta}>Learn more</span>
        </span>
      </span>
    );
  return (
    <span className={s.adEmail}>
      <span className={s.mailFrom}>
        <span className={s.avatar}>
          <AurelMark size={13} />
        </span>
        <span>
          <b>{PRODUCT.name}</b>
          <small>{a.email.subject}</small>
        </span>
      </span>
      <span key={a.id} className={s.mailHero}>
        <Artwork art={a.art} />
      </span>
      <span className={s.mailBody}>
        <b>{a.headline}</b>
        <span>{a.email.body}</span>
        <span className={s.fakeCta}>{a.email.cta}</span>
      </span>
    </span>
  );
}
