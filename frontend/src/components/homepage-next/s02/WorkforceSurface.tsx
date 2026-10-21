'use client';

/**
 * AI Employees (V12): a personal conversation with each employee beside that employee's own computer.
 *
 * The team arrives once (the entrance), then the selected employee's chat opens. The visitor assigns the job in
 * the composer (typed or picked from a suggestion), the employee clarifies, accepts with an assignment card, works
 * on its computer, comes back after a time skip with a report, and keeps going with follow-ups, approvals and
 * refusals. Every thread keeps its place while the visitor looks at other employees or the other mode.
 *
 * This is a deterministic sample conversation, not a live model: unscripted messages get an honest reply.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { Companion } from './Companion';
import { Workspace } from './Workspaces';
import { EMPLOYEES, employeeOf, type Card, type EmployeeId } from './team';
import { busy, clockOf, followupsOf, gateOf, type Msg, type Thread, type WfAction, type WfState } from './workforce';
import { COPY } from './script';
import { stateLabel } from './labels';
import w from './Workforce.module.css';

/* ---------------------------------------------------------------------------------------------- menu bar */
export function WorkforceMenu({ wf }: { wf: WfState }) {
  const e = employeeOf(wf.selected);
  return (
    <>
      <span key={wf.view === 'intro' ? 'team' : e.id} className={w.menuMid}>
        <em className={w.menuTag}>{COPY.conceptTag}</em>
        {wf.view === 'intro' ? 'Your AI team' : `Chat with your ${e.short}`}
      </span>
      <span className={w.menuClock} aria-hidden="true">
        {clockOf(wf.threads[wf.selected], wf.selected)}
      </span>
    </>
  );
}

/* ----------------------------------------------------------------------------------------------- the desk */
export function Workforce({ wf, dispatch, reduced }: { wf: WfState; dispatch: (a: WfAction) => void; reduced: boolean }) {
  if (wf.view === 'intro') return <Entrance dispatch={dispatch} />;
  const e = employeeOf(wf.selected);
  const t = wf.threads[wf.selected];
  return (
    <div className={w.split} data-pane={wf.pane} style={{ '--accent': e.accent } as CSSProperties}>
      <div className={w.paneSwitch} role="group" aria-label="Show">
        {(['chat', 'computer'] as const).map((p) => (
          <button key={p} type="button" aria-pressed={wf.pane === p} onClick={() => dispatch({ type: 'pane', pane: p })}>
            {p === 'chat' ? 'Chat' : 'Computer'}
            {p === 'computer' && t.state === 'working' && <i aria-hidden="true" />}
          </button>
        ))}
      </div>
      <Chat key={e.id} id={e.id} t={t} dispatch={dispatch} reduced={reduced} />
      <section className={w.computer} aria-label={e.computer.title}>
        <Workspace id={e.id} t={t} />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ team entrance */
function Entrance({ dispatch }: { dispatch: (a: WfAction) => void }) {
  return (
    <div className={w.entrance}>
      <p className={w.entranceTitle}>
        Six specialists. Each with its own job, chat and computer.
        <span>Pick one to open its conversation.</span>
      </p>
      <div className={w.team}>
        {EMPLOYEES.map((x, i) => (
          <button key={x.id} type="button" className={w.member} style={{ '--accent': x.accent, '--i': i } as CSSProperties} onClick={() => dispatch({ type: 'select', id: x.id })}>
            <Companion e={x} size={104} pedestal />
            <b>{x.role}</b>
            <small>{x.job}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- the chat */
function Chat({ id, t, dispatch, reduced }: { id: EmployeeId; t: Thread; dispatch: (a: WfAction) => void; reduced: boolean }) {
  const e = employeeOf(id);
  const log = useRef<HTMLDivElement>(null);
  const gate = gateOf(id, t);
  const follow = followupsOf(id, t);
  const isBusy = busy(t);
  const typing = isBusy && t.queue[0]?.t === 'emp';

  // keep the newest message in view inside the chat (the page itself never scrolls): follow new messages, cards
  // that grow, and the log shrinking when suggestions appear below it
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    const follow = () => el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
    follow();
    const mo = new MutationObserver(follow);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    const ro = new ResizeObserver(follow);
    ro.observe(el);
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [reduced]);

  const send = (text?: string) => dispatch({ type: 'send', id, text, manual: true });
  const suggestions = gate ? [{ key: 'gate', chip: gate.chip, text: gate.text }] : follow.map((f) => ({ key: f.id, chip: f.chip, text: f.text }));

  return (
    <section className={w.chat} aria-label={`Conversation with the ${e.role}`}>
      <header className={w.chatHead}>
        <Companion e={e} size={44} state={isBusy ? 'working' : 'active'} />
        <div className={w.who}>
          <b>{e.role}</b>
          <span>{t.msgs.length > 2 ? e.cadence : e.job}</span>
        </div>
        <span className={w.statePill} data-state={t.state}>
          <i aria-hidden="true" />
          {stateLabel(id, t)}
        </span>
      </header>

      <div ref={log} className={w.log} role="log" aria-label="Messages">
        {t.msgs.length === 0 && (
          <div className={w.hello}>
            <Companion e={e} size={76} />
            <p>Hi, I’m your {e.role}. Give me a responsibility and I’ll keep working on it, then report back here.</p>
          </div>
        )}
        {t.msgs.map((m) => (
          <Message key={m.id} m={m} id={id} t={t} dispatch={dispatch} />
        ))}
        {t.status && (
          <div className={w.working} key={t.status}>
            <i aria-hidden="true" />
            {t.status}
          </div>
        )}
        {typing && (
          <div className={w.typing} aria-label={`${e.short} is typing`}>
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      <div className={w.compose}>
        {suggestions.length > 0 && !isBusy && (
          <div className={w.chips} role="group" aria-label="Suggested messages">
            {suggestions.map((s) => (
              <button key={s.key} type="button" className={w.chipBtn} onClick={() => send(s.text)}>
                {s.chip}
              </button>
            ))}
          </div>
        )}
        <form
          className={w.composer}
          onSubmit={(ev) => {
            ev.preventDefault();
            send();
          }}
        >
          <input
            className={w.input}
            value={t.draft}
            placeholder={gate ? 'Assign a job, or pick a suggestion' : `Message your ${e.short}`}
            aria-label={`Message your ${e.short}`}
            onFocus={() => dispatch({ type: 'stop-auto' })}
            onChange={(ev) => dispatch({ type: 'draft', id, text: ev.target.value, manual: true })}
            maxLength={280}
            autoComplete="off"
          />
          <button type="submit" className={w.send} disabled={isBusy || !t.draft.trim()} aria-label="Send">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
            </svg>
          </button>
        </form>
        <p className={w.note}>Sample conversation · AI Employees are coming soon to Xroga</p>
      </div>
    </section>
  );
}

function Message({ m, id, t, dispatch }: { m: Msg; id: EmployeeId; t: Thread; dispatch: (a: WfAction) => void }) {
  if (m.from === 'skip')
    return (
      <div className={w.skip}>
        <span>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="6" cy="6" r="4.6" />
            <path d="M6 3.4V6l1.8 1.2" />
          </svg>
          {m.text}
        </span>
        <time>{m.at}</time>
      </div>
    );
  const e = employeeOf(id);
  return (
    <div className={w.msg} data-from={m.from}>
      {m.from === 'emp' && <Companion e={e} size={26} className={w.avatar} />}
      <div className={w.body}>
        <div className={w.bubble}>
          <p>{m.text}</p>
          {m.card && <CardView c={m.card} id={id} t={t} dispatch={dispatch} />}
        </div>
        <time className={w.time}>
          {m.from === 'user' ? 'You' : e.short} · {m.at}
        </time>
      </div>
    </div>
  );
}

function CardView({ c, id, t, dispatch }: { c: Card; id: EmployeeId; t: Thread; dispatch: (a: WfAction) => void }) {
  switch (c.kind) {
    case 'assignment':
      return (
        <div className={w.card} data-kind="assignment">
          <span className={w.cardTag}>Responsibility assigned</span>
          <dl>
            {c.rows.map(([k, v]) => (
              <div key={k} data-k={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case 'report':
      return (
        <div className={w.card} data-kind="report">
          <span className={w.cardTag}>Report</span>
          <b>{c.title}</b>
          <small>{c.meta}</small>
          <button type="button" className={w.cardBtn} onClick={() => dispatch({ type: 'pane', pane: 'computer' })}>
            {c.cta}
          </button>
        </div>
      );
    case 'gate': {
      const d = t.decisions[c.question];
      return (
        <div className={w.card} data-kind="gate" data-decided={d}>
          <span className={w.cardTag}>Needs your decision</span>
          <b>{c.question}</b>
          {d ? (
            <small>{d === 'approved' ? 'Approved in this preview. Nothing real was changed.' : 'Held. Nothing changed.'}</small>
          ) : (
            <div className={w.cardActions}>
              <button type="button" className={w.cardBtn} data-primary="" onClick={() => dispatch({ type: 'decide', id, key: c.question, value: 'approved' })}>
                Approve
              </button>
              <button type="button" className={w.cardBtn} onClick={() => dispatch({ type: 'decide', id, key: c.question, value: 'held' })}>
                Not yet
              </button>
            </div>
          )}
        </div>
      );
    }
    case 'blocked':
      return (
        <div className={w.card} data-kind="blocked">
          <span className={w.cardTag}>Not allowed</span>
          <b>{c.text}</b>
        </div>
      );
    case 'done':
      return (
        <div className={w.card} data-kind="done">
          <span className={w.cardTag}>Done</span>
          <b>{c.text}</b>
        </div>
      );
  }
}
