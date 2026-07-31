'use client';

/**
 * Showcase product: AI SaaS shell with a chat workspace.
 *
 * HONESTY CONSTRAINT — the single most important thing about this file.
 *
 * No model is called here, and nothing pretends one is. Assistant replies are
 * produced by a small local composer that echoes the structure of the user's own
 * message, and every one of them is labelled "Scripted reply · no model called".
 * A persistent banner states the same thing. The template ships the place where a
 * provider key would go; it does not ship a key, and it never fabricates model
 * output.
 *
 * The usage panel is likewise real: every figure is counted from what actually
 * happened in this browser session. Nothing there is invented.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { productReset } from './shared';

const BRAND = {
  name: 'Loomdesk',
  ink: '#0d1117',
  panel: '#141a23',
  panelHi: '#1b232f',
  border: '#26303d',
  muted: '#8b98ab',
  text: '#e8edf4',
  accent: '#f59e0b',
  accentDeep: '#b45309',
} as const;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  at: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
}

const SECTIONS = [
  { id: 'chat', label: 'Workspace' },
  { id: 'usage', label: 'Usage' },
  { id: 'setup', label: 'Connect a model' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const STARTERS = [
  'Summarise a customer interview',
  'Draft a release note',
  'Turn these bullets into an email',
  'Explain this error to a teammate',
];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Composes a reply from the user's own message.
 *
 * This is deliberately transparent rather than impressive: it reflects the input
 * back as a structure, so nobody could mistake it for a language model's output.
 * It is the seam where a real provider call would go.
 */
function composeScriptedReply(input: string): string {
  const trimmed = input.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((part) => part.trim().length > 0);
  const isQuestion = /\?\s*$/.test(trimmed);

  const lines = [
    `This is a scripted reply from the template — no language model was called.`,
    '',
    `What you sent: ${words.length} ${words.length === 1 ? 'word' : 'words'}${
      sentences.length > 1 ? ` across ${sentences.length} sentences` : ''
    }${isQuestion ? ', phrased as a question' : ''}.`,
  ];

  if (sentences.length > 1) {
    lines.push('', 'Your message broken into parts:');
    sentences.slice(0, 4).forEach((sentence, index) => {
      lines.push(`${index + 1}. ${sentence.trim()}`);
    });
  }

  lines.push(
    '',
    'Once you connect a provider key on the "Connect a model" tab, this same panel streams a real response instead. The interface, history, and usage tracking around it already work.',
  );

  return lines.join('\n');
}

export function AiSaas() {
  const uid = useId();
  const [section, setSection] = useState<SectionId>('chat');
  const [conversations, setConversations] = useState<Conversation[]>([
    { id: 'c-1', title: 'New conversation', messages: [] },
  ]);
  const [activeId, setActiveId] = useState('c-1');
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const active = conversations.find((item) => item.id === activeId) ?? conversations[0];

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [active?.messages.length, thinking]);

  function send(text: string) {
    const body = text.trim();
    if (!body || thinking) return;

    const userMessage: Message = { id: makeId(), role: 'user', body, at: Date.now() };
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === activeId
          ? {
              ...conversation,
              // Name the conversation from its first message, as a real one would.
              title:
                conversation.messages.length === 0
                  ? body.slice(0, 42) + (body.length > 42 ? '…' : '')
                  : conversation.title,
              messages: [...conversation.messages, userMessage],
            }
          : conversation,
      ),
    );
    setDraft('');
    setThinking(true);

    timerRef.current = window.setTimeout(() => {
      const reply: Message = { id: makeId(), role: 'assistant', body: composeScriptedReply(body), at: Date.now() };
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === activeId ? { ...conversation, messages: [...conversation.messages, reply] } : conversation,
        ),
      );
      setThinking(false);
    }, 520);
  }

  function newConversation() {
    const id = `c-${makeId()}`;
    setConversations((prev) => [{ id, title: 'New conversation', messages: [] }, ...prev]);
    setActiveId(id);
    setSection('chat');
    setNavOpen(false);
  }

  /** Every figure counted from real session activity — nothing invented. */
  const usage = useMemo(() => {
    const all = conversations.flatMap((conversation) => conversation.messages);
    const sent = all.filter((message) => message.role === 'user');
    const received = all.filter((message) => message.role === 'assistant');
    const characters = sent.reduce((total, message) => total + message.body.length, 0);
    const words = sent.reduce((total, message) => total + message.body.split(/\s+/).filter(Boolean).length, 0);
    const started = conversations.filter((conversation) => conversation.messages.length > 0).length;
    return {
      sent: sent.length,
      received: received.length,
      characters,
      words,
      started,
      longest: sent.reduce((max, message) => Math.max(max, message.body.length), 0),
    };
  }, [conversations]);

  return (
    <div className="ld-root">
      <style>{CSS}</style>

      <div className="ld-shell">
        {/* ------------------------------------------------------ sidebar */}
        <aside className={`ld-side${navOpen ? ' ld-side--open' : ''}`}>
          <div className="ld-side-top">
            <span className="ld-brand">
              <span className="ld-brand-mark" aria-hidden>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 5h7v14H4zM13 5h7v6h-7zM13 13h7v6h-7z" />
                </svg>
              </span>
              {BRAND.name}
            </span>
            <button type="button" className="ld-side-close" onClick={() => setNavOpen(false)} aria-label="Close navigation">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <button type="button" className="ld-new" onClick={newConversation}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New conversation
          </button>

          <nav className="ld-sections" aria-label="Sections">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`ld-section${section === item.id ? ' ld-section--on' : ''}`}
                aria-current={section === item.id ? 'page' : undefined}
                onClick={() => {
                  setSection(item.id);
                  setNavOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <p className="ld-side-label">History</p>
          <ul className="ld-history">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={`ld-history-item${conversation.id === activeId && section === 'chat' ? ' ld-history-item--on' : ''}`}
                  onClick={() => {
                    setActiveId(conversation.id);
                    setSection('chat');
                    setNavOpen(false);
                  }}
                >
                  <span className="ld-history-title">{conversation.title}</span>
                  <span className="ld-history-count">{conversation.messages.length}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="ld-plan">
            <p className="ld-plan-name">Template workspace</p>
            <p className="ld-plan-note">No account or subscription exists in this demonstration.</p>
          </div>
        </aside>

        {/* --------------------------------------------------------- main */}
        <div className="ld-main">
          <header className="ld-topbar">
            <button type="button" className="ld-menu" onClick={() => setNavOpen(true)} aria-label="Open navigation">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <h1 className="ld-topbar-title">
              {section === 'chat' ? active?.title ?? 'Workspace' : section === 'usage' ? 'Usage' : 'Connect a model'}
            </h1>
          </header>

          <div className="ld-demo-banner" role="note">
            <span className="ld-demo-dot" aria-hidden />
            <span>
              <strong>Demo mode.</strong> No language model is connected and none is called. Replies below are composed
              locally by the template and are labelled as such.
            </span>
          </div>

          {/* ------------------------------------------------------- chat */}
          {section === 'chat' && (
            <>
              <div className="ld-log" ref={logRef}>
                {active && active.messages.length === 0 && !thinking ? (
                  <div className="ld-blank">
                    <h2 className="ld-blank-title">Start a conversation</h2>
                    <p className="ld-blank-body">
                      The workspace, history, and usage tracking are all working. Send anything to see the flow.
                    </p>
                    <div className="ld-starters">
                      {STARTERS.map((starter) => (
                        <button key={starter} type="button" className="ld-starter" onClick={() => send(starter)}>
                          {starter}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ul className="ld-messages">
                    {active?.messages.map((message) => (
                      <li key={message.id} className={`ld-msg ld-msg--${message.role}`}>
                        <span className="ld-msg-who">
                          {message.role === 'user' ? 'You' : BRAND.name}
                          {message.role === 'assistant' && <span className="ld-msg-tag">Scripted reply · no model called</span>}
                        </span>
                        <div className="ld-msg-body">{message.body}</div>
                      </li>
                    ))}
                    {thinking && (
                      <li className="ld-msg ld-msg--assistant" aria-live="polite">
                        <span className="ld-msg-who">{BRAND.name}</span>
                        <div className="ld-typing" aria-label="Composing a scripted reply">
                          <span />
                          <span />
                          <span />
                        </div>
                      </li>
                    )}
                  </ul>
                )}
              </div>

              <form
                className="ld-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  send(draft);
                }}
              >
                <label className="ld-sr" htmlFor={`${uid}-draft`}>
                  Message
                </label>
                <textarea
                  id={`${uid}-draft`}
                  rows={1}
                  value={draft}
                  placeholder="Send a message…"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      send(draft);
                    }
                  }}
                />
                <button type="submit" className="ld-send" disabled={!draft.trim() || thinking}>
                  {thinking ? 'Composing…' : 'Send'}
                </button>
              </form>
            </>
          )}

          {/* ------------------------------------------------------ usage */}
          {section === 'usage' && (
            <div className="ld-pane">
              <p className="ld-pane-lede">
                Every figure below is counted from what actually happened in this browser session. Nothing is estimated
                or invented, and there is no billing account behind it.
              </p>

              <div className="ld-stats">
                {[
                  { label: 'Messages you sent', value: usage.sent },
                  { label: 'Replies composed', value: usage.received },
                  { label: 'Conversations started', value: usage.started },
                  { label: 'Words you typed', value: usage.words },
                  { label: 'Characters you typed', value: usage.characters },
                  { label: 'Longest message', value: `${usage.longest} chars` },
                ].map((stat) => (
                  <div key={stat.label} className="ld-stat">
                    <span className="ld-stat-label">{stat.label}</span>
                    <span className="ld-stat-value">{stat.value}</span>
                  </div>
                ))}
              </div>

              <h2 className="ld-h2">Per conversation</h2>
              {usage.sent === 0 ? (
                <p className="ld-pane-lede">Nothing recorded yet. Send a message in the workspace and it will appear here.</p>
              ) : (
                <table className="ld-table">
                  <thead>
                    <tr>
                      <th scope="col">Conversation</th>
                      <th scope="col">Messages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversations
                      .filter((conversation) => conversation.messages.length > 0)
                      .map((conversation) => (
                        <tr key={conversation.id}>
                          <td>{conversation.title}</td>
                          <td>{conversation.messages.length}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ------------------------------------------------------ setup */}
          {section === 'setup' && (
            <div className="ld-pane">
              <p className="ld-pane-lede">
                This template ships the workspace, not a provider key. Connecting a model is the one step it deliberately
                leaves to you, so no credential is ever bundled into a generated project.
              </p>

              <ol className="ld-steps">
                <li>
                  <h2 className="ld-h2">Add your key as a server environment variable</h2>
                  <p className="ld-body">
                    Keep it server-side only. A key placed in a client-visible variable is readable by anyone who opens
                    the page, so the template never reads one from the browser.
                  </p>
                  <pre className="ld-code">
                    <code>{`# .env.local — server only, never NEXT_PUBLIC_\nMODEL_API_KEY=your-key-here`}</code>
                  </pre>
                </li>
                <li>
                  <h2 className="ld-h2">Call the provider from the route handler</h2>
                  <p className="ld-body">
                    The chat panel posts to your own endpoint. That endpoint holds the key and talks to the provider, so
                    the token never reaches the browser.
                  </p>
                  <pre className="ld-code">
                    <code>{`// app/api/chat/route.ts\nexport async function POST(request: Request) {\n  const { messages } = await request.json();\n  // Call your provider here using process.env.MODEL_API_KEY\n  // and stream the response back to the client.\n}`}</code>
                  </pre>
                </li>
                <li>
                  <h2 className="ld-h2">Swap the local composer for the stream</h2>
                  <p className="ld-body">
                    Replace the scripted composer with a fetch to that route. The message list, history, and usage
                    counters need no changes — they already work against real messages.
                  </p>
                </li>
              </ol>

              <div className="ld-warn" role="note">
                Until that is done, this workspace stays in demo mode and says so on every reply. It will not present
                composed text as model output.
              </div>
            </div>
          )}
        </div>
      </div>

      {navOpen && <button type="button" className="ld-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
    </div>
  );
}

const CSS = `
${productReset('.ld-root')}
.ld-root {
  --ink: ${BRAND.ink};
  --panel: ${BRAND.panel};
  --panel-hi: ${BRAND.panelHi};
  --border: ${BRAND.border};
  --muted: ${BRAND.muted};
  --text: ${BRAND.text};
  --accent: ${BRAND.accent};
  --accent-deep: ${BRAND.accentDeep};
  height: 100%; min-height: 100vh; background: var(--ink); color: var(--text); line-height: 1.5;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.ld-root *, .ld-root *::before, .ld-root *::after { box-sizing: border-box; }
.ld-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ld-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.ld-shell { display: flex; height: 100vh; overflow: hidden; }

/* sidebar */
.ld-side {
  position: fixed; inset: 0 auto 0 0; z-index: 30; width: 268px;
  display: flex; flex-direction: column; gap: 14px; padding: 16px 14px;
  background: var(--panel); border-right: 1px solid var(--border);
  transform: translateX(-100%); transition: transform 220ms ease;
}
.ld-side--open { transform: none; }
.ld-side-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ld-brand { display: inline-flex; align-items: center; gap: 9px; font-size: 14.5px; font-weight: 750; letter-spacing: -0.01em; }
.ld-brand-mark { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; background: var(--accent); color: #201302; }
.ld-side-close { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 9px; background: none; color: var(--text); cursor: pointer; }
.ld-new {
  display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 14px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel-hi);
  color: var(--text); font-size: 13px; font-weight: 650; cursor: pointer; font-family: inherit;
}
.ld-new:hover { border-color: var(--accent); color: var(--accent); }
.ld-sections { display: grid; gap: 2px; }
.ld-section {
  padding: 9px 11px; border: 0; border-radius: 9px; background: none; text-align: left;
  color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
}
.ld-section:hover { background: var(--panel-hi); color: var(--text); }
.ld-section--on { background: var(--panel-hi); color: var(--accent); }
.ld-side-label { margin: 6px 0 0; padding: 0 4px; font-size: 10.5px; font-weight: 750; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.ld-history { flex: 1; overflow-y: auto; display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; align-content: start; }
.ld-history-item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 11px;
  border: 0; border-radius: 9px; background: none; text-align: left;
  color: var(--muted); font-size: 12.5px; cursor: pointer; font-family: inherit;
}
.ld-history-item:hover { background: var(--panel-hi); color: var(--text); }
.ld-history-item--on { background: var(--panel-hi); color: var(--text); }
.ld-history-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ld-history-count { flex: none; padding: 1px 6px; border-radius: 999px; background: rgba(255,255,255,0.07); font-size: 10.5px; }
.ld-plan { padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-hi); }
.ld-plan-name { margin: 0; font-size: 12.5px; font-weight: 700; }
.ld-plan-note { margin: 4px 0 0; font-size: 11px; line-height: 1.5; color: var(--muted); }
.ld-scrim { position: fixed; inset: 0; z-index: 25; border: 0; background: rgba(0,0,0,0.55); cursor: pointer; }

/* main */
.ld-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.ld-topbar { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--border); }
.ld-menu { display: grid; place-items: center; width: 34px; height: 34px; flex: none; border: 1px solid var(--border); border-radius: 9px; background: none; color: var(--text); cursor: pointer; }
.ld-topbar-title { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.015em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ld-demo-banner {
  display: flex; align-items: flex-start; gap: 9px; padding: 10px 18px;
  background: rgba(245,158,11,0.1); border-bottom: 1px solid rgba(245,158,11,0.28);
  font-size: 12.5px; line-height: 1.55; color: #fcd34d;
}
.ld-demo-dot { flex: none; width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: var(--accent); }

/* log */
.ld-log { flex: 1; overflow-y: auto; padding: 20px 18px; }
.ld-blank { max-width: 560px; margin: 32px auto; text-align: center; }
.ld-blank-title { margin: 0; font-size: 21px; font-weight: 760; letter-spacing: -0.024em; }
.ld-blank-body { margin: 9px 0 0; font-size: 13.5px; line-height: 1.6; color: var(--muted); }
.ld-starters { display: grid; gap: 8px; margin-top: 22px; }
.ld-starter {
  padding: 11px 14px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel);
  color: var(--text); font-size: 13px; text-align: left; cursor: pointer; font-family: inherit;
}
.ld-starter:hover { border-color: var(--accent); color: var(--accent); }

.ld-messages { display: grid; gap: 18px; max-width: 760px; margin: 0 auto; padding: 0; list-style: none; }
.ld-msg { display: grid; gap: 6px; }
.ld-msg-who { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 11.5px; font-weight: 750; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.ld-msg-tag {
  padding: 2px 8px; border-radius: 999px; background: rgba(245,158,11,0.14);
  color: #fcd34d; font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: none;
}
.ld-msg-body {
  padding: 13px 15px; border-radius: 13px; font-size: 13.5px; line-height: 1.66; white-space: pre-wrap;
  border: 1px solid var(--border); background: var(--panel);
}
.ld-msg--user .ld-msg-body { background: var(--panel-hi); border-color: #334052; }
.ld-typing { display: inline-flex; gap: 5px; padding: 15px; }
.ld-typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); animation: ld-bounce 1.1s infinite ease-in-out; }
.ld-typing span:nth-child(2) { animation-delay: 0.15s; }
.ld-typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes ld-bounce { 0%, 60%, 100% { opacity: 0.35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-4px); } }

/* composer */
.ld-composer {
  display: flex; align-items: flex-end; gap: 10px; padding: 14px 18px 18px;
  border-top: 1px solid var(--border); background: var(--ink);
}
.ld-composer textarea {
  flex: 1; min-height: 44px; max-height: 160px; padding: 12px 14px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--panel);
  color: var(--text); font-size: 13.5px; font-family: inherit; resize: vertical;
}
.ld-composer textarea:focus { outline: none; border-color: var(--accent); }
.ld-send {
  flex: none; padding: 12px 20px; border: 0; border-radius: 12px;
  background: var(--accent); color: #201302; font-size: 13px; font-weight: 720; cursor: pointer; font-family: inherit;
}
.ld-send:disabled { opacity: 0.42; cursor: not-allowed; }

/* panes */
.ld-pane { flex: 1; overflow-y: auto; padding: 22px 18px 34px; max-width: 800px; }
.ld-pane-lede { margin: 0 0 20px; font-size: 13.5px; line-height: 1.65; color: var(--muted); }
.ld-h2 { margin: 26px 0 0; font-size: 14.5px; font-weight: 720; letter-spacing: -0.012em; }
.ld-body { margin: 7px 0 0; font-size: 13px; line-height: 1.62; color: var(--muted); }
.ld-stats { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.ld-stat { display: grid; gap: 4px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.ld-stat-label { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
.ld-stat-value { font-size: 22px; font-weight: 800; letter-spacing: -0.025em; font-variant-numeric: tabular-nums; }
.ld-table { width: 100%; margin-top: 14px; border-collapse: collapse; font-size: 13px; }
.ld-table th, .ld-table td { padding: 9px 11px; text-align: left; border-bottom: 1px solid var(--border); }
.ld-table th { font-size: 10.5px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.ld-steps { display: grid; gap: 22px; margin: 0; padding: 0 0 0 20px; }
.ld-steps li::marker { color: var(--accent); font-weight: 700; }
.ld-code {
  margin: 11px 0 0; padding: 13px 15px; overflow-x: auto;
  border: 1px solid var(--border); border-radius: 10px; background: #0a0e14;
  font-size: 12px; line-height: 1.65; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.ld-warn {
  margin-top: 26px; padding: 14px 16px; border-radius: 11px;
  background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3);
  font-size: 12.5px; line-height: 1.6; color: #fcd34d;
}

@media (min-width: 900px) {
  .ld-side { position: relative; inset: auto; transform: none; }
  .ld-side-close, .ld-menu { display: none; }
  .ld-scrim { display: none; }
  .ld-starters { grid-template-columns: repeat(2, 1fr); }
  .ld-pane, .ld-log, .ld-composer { padding-inline: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  .ld-root *, .ld-root *::before, .ld-root *::after { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; }
}
`;
