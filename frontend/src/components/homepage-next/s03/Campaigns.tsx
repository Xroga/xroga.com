'use client';

/**
 * World B, Campaigns: the opportunity becomes something people will actually see. Pick an audience and the three
 * creatives (search ad, social post, email) are re-made for it; pick a channel to bring its creative forward, or
 * preview it large. Approval is a reversible preview: nothing is published, sent or spent.
 */
import type { Dispatch } from 'react';
import { Art } from './Art';
import { AUDIENCES, BRAND, CHANNELS, audienceOf, queryOf, type Audience, type Channel } from './data';
import { rovingKeys } from './keys';
import { ToolMark } from './marks';
import type { Action, State } from './state';
import s from './S03.module.css';

export function Campaigns({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const a = audienceOf(st.audience);
  return (
    <div className={s.campaigns}>
      <div className={s.plan}>
        <div className={s.planGroup}>
          <span className={s.label}>Audience</span>
          <div className={s.audiences} role="radiogroup" aria-label="Audience" onKeyDown={rovingKeys}>
            {AUDIENCES.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={x.id === a.id}
                tabIndex={x.id === a.id ? 0 : -1}
                className={s.aud}
                data-art={x.art}
                onClick={() => dispatch({ type: 'audience', id: x.id })}
              >
                <i aria-hidden="true" />
                <span>
                  <b>{x.name}</b>
                  <small>
                    {x.region} · {x.size}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <p className={s.from}>From “{queryOf(a.from).query}”</p>
        </div>

        <div className={s.planGroup}>
          <span className={s.label}>Channels</span>
          <div className={s.channels} role="radiogroup" aria-label="Creative to inspect" onKeyDown={rovingKeys}>
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={st.channel === c.id}
                tabIndex={st.channel === c.id ? 0 : -1}
                className={s.chan}
                onClick={() => dispatch({ type: 'channel', id: c.id })}
              >
                <ToolMark id={c.provider} size={16} />
                <span>{c.name}</span>
                <em>{c.cap}</em>
              </button>
            ))}
          </div>
        </div>

        <div className={s.approval} data-on={st.approved || undefined} aria-live="polite">
          <span>
            <b>{st.approved ? 'Approved in this preview' : 'Draft · needs your approval'}</b>
            <small>{st.approved ? 'Nothing was published, sent or spent.' : '$0 spent · nothing scheduled'}</small>
          </span>
          <button
            type="button"
            className={s.solidBtn}
            data-tone={st.approved ? 'quiet' : 'amber'}
            aria-pressed={st.approved}
            onClick={() => dispatch({ type: 'approve' })}
          >
            {st.approved ? 'Undo' : 'Approve preview'}
          </button>
        </div>
      </div>

      <div className={s.canvas} data-front={st.channel} data-art={a.art}>
        <div key={a.id} className={s.fan}>
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={s.creative}
              data-channel={c.id}
              data-front={st.channel === c.id || undefined}
              aria-label={`${c.name} for ${a.name}${st.channel === c.id ? ', selected' : ''}`}
              onClick={() => dispatch({ type: 'channel', id: c.id })}
              tabIndex={-1}
            >
              <Creative channel={c.id} a={a} />
            </button>
          ))}
        </div>
        <button type="button" className={s.previewBtn} aria-expanded={st.layer === 'preview'} onClick={() => dispatch({ type: 'layer', layer: 'preview' })}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 8s2-4.5 5.5-4.5S13.5 8 13.5 8 11.5 12.5 8 12.5 2.5 8 2.5 8Z" />
            <circle cx="8" cy="8" r="1.8" />
          </svg>
          Preview campaign
        </button>
      </div>

      {st.layer === 'preview' && (
        <div className={s.preview} role="dialog" aria-modal="false" aria-label={`Preview: ${a.name}`}>
          <div className={s.previewHead}>
            <span>
              <b>{a.name}</b>
              <small>Local preview · not published</small>
            </span>
            <div className={s.previewTabs} role="tablist" aria-label="Creative" onKeyDown={rovingKeys}>
              {CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={st.channel === c.id}
                  tabIndex={st.channel === c.id ? 0 : -1}
                  onClick={() => dispatch({ type: 'channel', id: c.id })}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <button type="button" className={s.closeBtn} data-tone="dark" onClick={() => dispatch({ type: 'layer', layer: null })} aria-label="Close preview">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
          <div key={`${a.id}-${st.channel}`} className={s.previewBody} data-channel={st.channel}>
            <Creative channel={st.channel} a={a} large />
          </div>
        </div>
      )}
    </div>
  );
}

function Creative({ channel, a, large = false }: { channel: Channel; a: Audience; large?: boolean }) {
  if (channel === 'search')
    return (
      <span className={s.adSearch} data-large={large || undefined}>
        <span className={s.adTop}>
          <b>Sponsored</b> · {BRAND.domain}
        </span>
        <span className={s.adHead}>{a.search.headline}</span>
        <span className={s.adDesc}>{a.search.description}</span>
        <span className={s.adLinks}>
          {a.search.links.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </span>
      </span>
    );
  if (channel === 'social')
    return (
      <span className={s.adSocial} data-large={large || undefined}>
        <span className={s.adTop}>
          <i aria-hidden="true" />
          <b>{BRAND.name}</b> · Sponsored
        </span>
        <span className={s.socialArt}>
          <Art kind={a.art} />
          <span className={s.socialLine}>{a.social.line}</span>
        </span>
        <span className={s.socialFoot}>
          <span>{a.social.tag}</span>
          <span className={s.fakeCta}>Shop now</span>
        </span>
      </span>
    );
  return (
    <span className={s.adEmail} data-large={large || undefined}>
      <span className={s.mailHead}>
        <i aria-hidden="true" />
        <span>
          <b>{BRAND.name}</b>
          <small>{a.email.subject}</small>
        </span>
      </span>
      <span className={s.mailArt}>
        <Art kind={a.art} />
      </span>
      <span className={s.mailBody}>
        <b>{a.email.subject}</b>
        <span>{a.email.preview}</span>
        <span className={s.fakeCta}>{a.email.cta}</span>
      </span>
    </span>
  );
}
