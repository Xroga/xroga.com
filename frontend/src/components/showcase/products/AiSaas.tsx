'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { productReset } from './shared';

type Role = 'user' | 'assistant';
type Theme = 'dark' | 'light';
type Persona = 'balanced' | 'concise' | 'creative' | 'developer';
type Model = 'llama-3.3-70b-versatile' | 'llama-3.1-8b-instant' | 'openai/gpt-oss-120b' | 'openai/gpt-oss-20b';

interface Message { id: string; role: Role; content: string; time: string }
interface Conversation { id: string; title: string; messages: Message[]; updatedAt: number }

const MODELS: Array<{ id: Model; name: string; note: string }> = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', note: 'Balanced · high quality' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', note: 'Ultra-fast · lightweight' },
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', note: 'Deep reasoning · code' },
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', note: 'Fast reasoning · code' },
];

const PROMPTS = [
  { title: 'Plan a launch', note: 'Strategy, positioning & execution', prompt: 'Design a launch strategy for a premium AI SaaS product. Give me positioning, audience, offer, and a 30-day action plan.' },
  { title: 'Audit a product', note: 'Find UX gaps and opportunities', prompt: 'Act as a senior product designer. Review a modern AI chat product and give me a concise UX audit with the 8 highest-impact improvements.' },
  { title: 'Build something', note: 'Product, code & architecture', prompt: 'Build me a clean, production-ready landing page structure for an AI startup. Include the exact sections, conversion copy angles, and CTA strategy.' },
  { title: 'Shape an idea', note: 'From rough thought to clear brief', prompt: 'Turn this rough idea into a sharp one-page business concept: an AI assistant that helps small agencies automate client reporting, insights, and next-step recommendations.' },
];

function id() { return Math.random().toString(36).slice(2, 10); }
function clock() { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date()); }

export function AiSaas() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState<Model>('llama-3.3-70b-versatile');
  const [persona, setPersona] = useState<Persona>('balanced');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1400);
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([
    { id: 'welcome', title: 'New conversation', messages: [], updatedAt: Date.now() },
  ]);
  const [activeId, setActiveId] = useState('welcome');
  const scrollRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const active = conversations.find((chat) => chat.id === activeId) ?? conversations[0];
  const modelInfo = MODELS.find((item) => item.id === model) ?? MODELS[0];
  const messageCount = conversations.reduce((sum, chat) => sum + chat.messages.length, 0);

  useEffect(() => {
    fetch('/api/showcase/aura/health', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data: { configured?: boolean }) => setConfigured(Boolean(data.configured)))
      .catch(() => setConfigured(false));
    return () => controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [active?.messages, generating]);

  function updateConversation(chatId: string, updater: (chat: Conversation) => Conversation) {
    setConversations((items) => items.map((chat) => (chat.id === chatId ? updater(chat) : chat)));
  }

  function newChat() {
    const chat: Conversation = { id: id(), title: 'New conversation', messages: [], updatedAt: Date.now() };
    setConversations((items) => [chat, ...items]);
    setActiveId(chat.id);
    setError(null);
    setMobileOpen(false);
  }

  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!content || generating) return;
    const chatId = activeId;
    const user: Message = { id: id(), role: 'user', content, time: clock() };
    const assistantId = id();
    const history = [...active.messages, user].map(({ role, content: body }) => ({ role, content: body }));
    updateConversation(chatId, (chat) => ({
      ...chat,
      title: chat.messages.length ? chat.title : content.slice(0, 38) + (content.length > 38 ? '…' : ''),
      updatedAt: Date.now(),
      messages: [...chat.messages, user, { id: assistantId, role: 'assistant', content: '', time: clock() }],
    }));
    setDraft('');
    setError(null);
    setGenerating(true);
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch('/api/showcase/aura/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, model, persona, temperature, maxTokens }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || 'Aura could not complete that request.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          for (const line of event.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const data = JSON.parse(raw) as { choices?: Array<{ delta?: { content?: string } }> };
              const delta = data.choices?.[0]?.delta?.content ?? '';
              if (!delta) continue;
              full += delta;
              updateConversation(chatId, (chat) => ({
                ...chat,
                messages: chat.messages.map((message) => message.id === assistantId ? { ...message, content: full } : message),
              }));
            } catch { /* ignore upstream keep-alive events */ }
          }
        }
      }
      if (!full) throw new Error('Aura returned an empty response. Please try again.');
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
        const message = reason instanceof Error ? reason.message : 'Aura could not complete that request.';
        setError(message);
        updateConversation(chatId, (chat) => ({ ...chat, messages: chat.messages.filter((item) => item.id !== assistantId) }));
      }
    } finally {
      setGenerating(false);
      controllerRef.current = null;
    }
  }

  const relativeHistory = useMemo(() => conversations.map((chat) => ({ ...chat, when: chat.messages.length ? 'Just now' : 'Empty' })), [conversations]);

  return (
    <div className={`aura-root aura-${theme}${sidebarOpen ? '' : ' aura-collapsed'}`}>
      <style>{CSS}</style>
      <div className="aura-ambient aura-ambient-a" /><div className="aura-ambient aura-ambient-b" />
      <div className="aura-shell">
        <aside className={`aura-sidebar${mobileOpen ? ' aura-mobile-open' : ''}`} aria-label="Conversation navigation">
          <div className="aura-brand-row">
            <button className="aura-brand" type="button" onClick={newChat} aria-label="Aura home">
              <span className="aura-brand-mark"><i /></span>
              <span><strong>Aura</strong><small>by Xroga AI</small></span>
            </button>
            <button className="aura-icon aura-collapse" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>‹</button>
          </div>
          <button className="aura-new" type="button" onClick={newChat}><span>＋</span><b>New chat</b><kbd>⌘ K</kbd></button>
          <section className="aura-history-section">
            <div className="aura-section-label"><span>Recent</span><button type="button" onClick={() => { setConversations([{ id: 'welcome', title: 'New conversation', messages: [], updatedAt: Date.now() }]); setActiveId('welcome'); }}>Clear</button></div>
            <div className="aura-history">
              {relativeHistory.map((chat) => <button key={chat.id} type="button" className={`aura-history-item${chat.id === activeId ? ' active' : ''}`} onClick={() => { setActiveId(chat.id); setMobileOpen(false); }}><span>◫</span><span><strong>{chat.title}</strong><small>{chat.when}</small></span></button>)}
            </div>
          </section>
          <div className="aura-side-bottom">
            <div className="aura-usage"><span><b>Local session</b><b>{messageCount} msgs</b></span><i><b style={{ width: `${Math.min(100, Math.max(7, messageCount * 7))}%` }} /></i><small>History stays in this preview session</small></div>
            <button className="aura-profile" type="button" onClick={() => setSettingsOpen(true)}><span>XA</span><span><strong>Powered by Xroga AI</strong><small>Groq API · Test template</small></span><b>•••</b></button>
          </div>
        </aside>

        <main className="aura-main">
          <header className="aura-topbar">
            <div className="aura-top-left">
              <button className="aura-icon aura-mobile-menu" type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu">☰</button>
              <button className="aura-model-pill" type="button" onClick={() => setModelOpen((open) => !open)} aria-expanded={modelOpen}><span /><span><small>Model</small><strong>{modelInfo.name}</strong></span><b>⌄</b></button>
              {modelOpen && <div className="aura-model-menu"><header>Choose model <span>Groq</span></header>{MODELS.map((item) => <button key={item.id} type="button" onClick={() => { setModel(item.id); setModelOpen(false); }}><i /><span><strong>{item.name}</strong><small>{item.note}</small></span>{item.id === model && <b>Active</b>}</button>)}</div>}
            </div>
            <div className="aura-actions">
              <span className={`aura-status ${configured ? 'online' : configured === false ? 'offline' : ''}`}><i />{configured ? 'Groq live' : configured === false ? 'Demo offline' : 'Checking Groq'}</span>
              <button className="aura-icon" type="button" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? '☼' : '☾'}</button>
              <button className="aura-icon" type="button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">⚙</button>
            </div>
          </header>

          <div className="aura-scroll" ref={scrollRef}>
            {!active.messages.length ? <section className="aura-welcome">
              <div className="aura-spark"><span /><i /><b /></div>
              <p className="aura-eyebrow"><span /> XROGA AI · GROQ API SHOWCASE</p>
              <h1>Meet Aura. <em>Think clearly.<br />Build beautifully.</em></h1>
              <p>A focused AI workspace for strategy, writing, product thinking, and code—powered by fast Groq inference through a private server route.</p>
              <div className="aura-providers"><span><i />Powered by <strong>Xroga AI</strong></span><span><i />AI inference via <strong>Groq API</strong></span><span>LIVE TEST TEMPLATE</span></div>
              <div className="aura-prompts">{PROMPTS.map((item, index) => <button key={item.title} type="button" onClick={() => sendMessage(item.prompt)}><span>{['↗','◇','⌘','✦'][index]}</span><span><strong>{item.title}</strong><small>{item.note}</small></span><b>›</b></button>)}</div>
              <div className="aura-trust"><span>● Private server-side API</span><span>Real Groq responses</span><span>Public test · rate limited</span><span>Enter to send</span></div>
            </section> : <section className="aura-messages" aria-live="polite">
              {active.messages.map((message) => <article key={message.id} className={`aura-message ${message.role}`}><div className="aura-avatar">{message.role === 'assistant' ? '✦' : 'You'}</div><div><header><strong>{message.role === 'assistant' ? 'Aura' : 'You'}</strong><span>{message.time}</span></header><div className="aura-message-body">{message.content || <span className="aura-typing"><i /><i /><i /></span>}</div>{message.content && <button type="button" className="aura-copy" onClick={() => navigator.clipboard.writeText(message.content)}>Copy</button>}</div></article>)}
            </section>}
          </div>

          <div className="aura-composer-wrap">
            {error && <div className="aura-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)}>Dismiss</button></div>}
            <form className={`aura-composer${generating ? ' generating' : ''}`} onSubmit={(event: FormEvent) => { event.preventDefault(); sendMessage(); }}>
              <textarea value={draft} maxLength={8000} rows={1} placeholder="Message Aura…" aria-label="Message Aura" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} />
              <div><button className="aura-enhance" type="button" onClick={() => setDraft((text) => text ? `Improve this prompt and then answer it clearly: ${text}` : text)}>✦ <span>Enhance prompt</span></button><small>{draft.length} / 8000</small><button className="aura-send" type={generating ? 'button' : 'submit'} disabled={!draft.trim() && !generating} onClick={generating ? () => controllerRef.current?.abort() : undefined} aria-label={generating ? 'Stop generating' : 'Send message'}>{generating ? '■' : '↑'}</button></div>
            </form>
            <p>Aura can make mistakes. Verify important information. <span>Powered by Xroga AI · Responses via Groq API.</span></p>
          </div>
        </main>
      </div>

      {mobileOpen && <button className="aura-overlay aura-mobile-overlay" type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
      {settingsOpen && <button className="aura-overlay" type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings" />}
      <aside className={`aura-settings${settingsOpen ? ' open' : ''}`} aria-hidden={!settingsOpen}>
        <header><span><small>Workspace</small><h2>AI settings</h2></span><button className="aura-icon" type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></header>
        <label>Assistant style<select value={persona} onChange={(event) => setPersona(event.target.value as Persona)}><option value="balanced">Balanced</option><option value="concise">Concise</option><option value="creative">Creative</option><option value="developer">Developer</option></select></label>
        <label><span>Creativity <output>{temperature.toFixed(1)}</output></span><input type="range" min="0" max="1.5" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /><small>Precise <b>Imaginative</b></small></label>
        <label><span>Max response <output>{maxTokens}</output></span><input type="range" min="400" max="3000" step="100" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} /><small>Short <b>Long</b></small></label>
        <div className="aura-safe"><b>◇</b><span><strong>Server-side key protection</strong><p>The Groq credential is read only by the Xroga server route and never sent to this browser.</p></span></div>
        <button className="aura-reset" type="button" onClick={() => { newChat(); setSettingsOpen(false); setTheme('dark'); setPersona('balanced'); setTemperature(0.7); setMaxTokens(1400); }}>Reset local app data</button>
      </aside>
    </div>
  );
}

const CSS = `
${productReset('.aura-root')}
.aura-root{--bg:#090a0f;--panel:#10121a;--panel2:#151822;--line:rgba(255,255,255,.09);--line2:rgba(255,255,255,.15);--text:#f4f6fb;--muted:#8c93a6;--muted2:#656b7b;--mint:#9ef5d1;--blue:#8bbcff;position:relative;height:100dvh;min-height:560px;overflow:hidden;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.aura-light{--bg:#f7f8fb;--panel:#fff;--panel2:#f1f4f8;--line:rgba(17,24,39,.1);--line2:rgba(17,24,39,.17);--text:#151823;--muted:#6e7484;--muted2:#9aa0ac;--mint:#24a879;--blue:#4f7fe3}
.aura-root button,.aura-root textarea,.aura-root select,.aura-root input{font:inherit}.aura-root button{color:inherit}.aura-ambient{position:absolute;pointer-events:none;filter:blur(3px);opacity:.55}.aura-ambient-a{width:620px;height:420px;left:23%;top:-260px;background:radial-gradient(ellipse,rgba(91,121,255,.2),transparent 68%)}.aura-ambient-b{width:620px;height:540px;right:-160px;bottom:-280px;background:radial-gradient(ellipse,rgba(115,240,197,.12),transparent 68%)}
.aura-shell{position:relative;display:grid;grid-template-columns:284px minmax(0,1fr);height:100%;transition:grid-template-columns .28s ease}.aura-collapsed .aura-shell{grid-template-columns:78px minmax(0,1fr)}.aura-sidebar{z-index:15;display:flex;min-width:0;flex-direction:column;overflow:hidden;border-right:1px solid var(--line);padding:18px 14px;background:color-mix(in srgb,var(--panel) 84%,transparent);backdrop-filter:blur(28px)}
.aura-brand-row{display:flex;height:48px;align-items:center;justify-content:space-between;padding:0 4px 0 6px}.aura-brand{display:flex;min-width:0;align-items:center;gap:11px;border:0;background:none;padding:0}.aura-brand>span:last-child{display:grid;text-align:left;white-space:nowrap}.aura-brand strong{font-size:15px}.aura-brand small{margin-top:3px;color:var(--muted);font-size:10px}.aura-brand-mark{position:relative;display:grid;width:30px;height:30px;flex:none;place-items:center;border:1px solid color-mix(in srgb,var(--mint) 22%,transparent);border-radius:10px;background:linear-gradient(145deg,color-mix(in srgb,var(--mint) 20%,transparent),color-mix(in srgb,var(--blue) 12%,transparent))}.aura-brand-mark:before,.aura-brand-mark:after,.aura-brand-mark i{position:absolute;width:14px;height:3px;border-radius:9px;background:var(--mint);content:""}.aura-brand-mark:before{transform:rotate(45deg)}.aura-brand-mark:after{transform:rotate(-45deg)}.aura-brand-mark i{width:3px;height:14px}
.aura-icon{display:grid;width:36px;height:36px;place-items:center;border:1px solid transparent;border-radius:11px;background:transparent;color:var(--muted);font-size:18px}.aura-icon:hover{border-color:var(--line);background:color-mix(in srgb,var(--text) 4%,transparent);color:var(--text)}.aura-new{display:flex;min-height:45px;align-items:center;gap:10px;margin:18px 0 16px;padding:0 12px;overflow:hidden;border:1px solid var(--line2);border-radius:13px;background:color-mix(in srgb,var(--text) 3%,transparent)}.aura-new:hover{border-color:color-mix(in srgb,var(--mint) 24%,transparent);background:color-mix(in srgb,var(--mint) 5%,transparent)}.aura-new b{flex:1;text-align:left;font-size:13px;white-space:nowrap}.aura-new kbd{padding:3px 5px;border:1px solid var(--line);border-radius:6px;color:var(--muted);font-size:9px}
.aura-history-section{display:flex;min-height:0;flex:1;flex-direction:column}.aura-section-label{display:flex;align-items:center;justify-content:space-between;padding:8px 7px;color:var(--muted2);font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;white-space:nowrap}.aura-section-label button{border:0;background:none;color:inherit;font-size:9px}.aura-history{overflow:auto;scrollbar-width:none}.aura-history-item{position:relative;display:flex;width:100%;align-items:center;gap:10px;padding:10px 8px;border:0;border-radius:11px;background:none;color:var(--muted);text-align:left}.aura-history-item:hover,.aura-history-item.active{background:color-mix(in srgb,var(--text) 4%,transparent);color:var(--text)}.aura-history-item.active:before{position:absolute;left:0;width:2px;height:18px;border-radius:3px;background:var(--mint);content:""}.aura-history-item>span:last-child{display:grid;min-width:0;gap:3px}.aura-history-item strong{overflow:hidden;font-size:12px;font-weight:520;text-overflow:ellipsis;white-space:nowrap}.aura-history-item small{color:var(--muted2);font-size:10px}
.aura-side-bottom{border-top:1px solid var(--line);padding-top:12px}.aura-usage{padding:10px 9px}.aura-usage>span{display:flex;justify-content:space-between;color:var(--muted);font-size:10px}.aura-usage>i{display:block;height:3px;margin-top:8px;overflow:hidden;border-radius:9px;background:var(--line)}.aura-usage>i b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--mint),var(--blue))}.aura-usage small{display:block;margin-top:8px;color:var(--muted2);font-size:9px}.aura-profile{display:flex;width:100%;align-items:center;gap:10px;padding:8px;border:0;border-radius:12px;background:none;text-align:left}.aura-profile:hover{background:color-mix(in srgb,var(--text) 4%,transparent)}.aura-profile>span:first-child{display:grid;width:30px;height:30px;flex:none;place-items:center;border:1px solid var(--line2);border-radius:9px;background:var(--panel2);font-size:9px}.aura-profile>span:nth-child(2){display:grid;min-width:0;flex:1}.aura-profile strong{font-size:11px}.aura-profile small{color:var(--muted);font-size:9px}.aura-profile>b{color:var(--muted)}
.aura-collapsed .aura-brand>span:last-child,.aura-collapsed .aura-new b,.aura-collapsed .aura-new kbd,.aura-collapsed .aura-section-label,.aura-collapsed .aura-history-item>span:last-child,.aura-collapsed .aura-usage,.aura-collapsed .aura-profile>span:nth-child(2),.aura-collapsed .aura-profile>b{display:none}.aura-collapsed .aura-brand-row,.aura-collapsed .aura-new,.aura-collapsed .aura-history-item,.aura-collapsed .aura-profile{justify-content:center}.aura-collapsed .aura-collapse{position:absolute;left:61px;transform:rotate(180deg);border-color:var(--line);background:var(--panel)}
.aura-main{position:relative;display:flex;min-width:0;height:100%;flex-direction:column;background-image:linear-gradient(color-mix(in srgb,var(--text) 1.2%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--text) 1.2%,transparent) 1px,transparent 1px);background-size:38px 38px}.aura-topbar{z-index:10;display:flex;height:70px;flex:none;align-items:center;justify-content:space-between;padding:0 26px;background:linear-gradient(to bottom,var(--bg) 35%,transparent)}.aura-top-left{position:relative;display:flex;align-items:center;gap:8px}.aura-model-pill{display:flex;height:42px;align-items:center;gap:9px;padding:0 11px;border:1px solid var(--line);border-radius:13px;background:color-mix(in srgb,var(--text) 2.5%,transparent)}.aura-model-pill>span:first-child{width:22px;height:22px;border-radius:7px;background:radial-gradient(circle at 32% 30%,#cffff0,#83e3c0 34%,#47796b 72%,#25322f);box-shadow:0 0 22px rgba(158,245,209,.18)}.aura-model-pill>span:nth-child(2){display:grid;text-align:left}.aura-model-pill small{color:var(--muted);font-size:8px;letter-spacing:.08em;text-transform:uppercase}.aura-model-pill strong{font-size:11px}.aura-model-pill>b{color:var(--muted)}.aura-actions{display:flex;align-items:center;gap:6px}.aura-status{display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid var(--line);border-radius:99px;color:var(--muted);font-size:10px}.aura-status i{width:6px;height:6px;border-radius:50%;background:#f1b85e;box-shadow:0 0 10px #f1b85e}.aura-status.online i{background:var(--mint);box-shadow:0 0 10px var(--mint)}.aura-status.offline i{background:#ff8f9a;box-shadow:0 0 10px #ff8f9a}
.aura-model-menu{position:absolute;z-index:30;top:50px;left:0;width:310px;padding:8px;border:1px solid var(--line2);border-radius:16px;background:color-mix(in srgb,var(--panel) 97%,transparent);box-shadow:0 24px 80px rgba(0,0,0,.3);backdrop-filter:blur(30px)}.aura-model-menu header{display:flex;justify-content:space-between;padding:7px 9px 10px;color:var(--muted);font-size:10px}.aura-model-menu header span{color:var(--mint);font-size:9px;letter-spacing:.1em;text-transform:uppercase}.aura-model-menu button{display:flex;width:100%;align-items:center;gap:10px;padding:10px;border:0;border-radius:11px;background:none;text-align:left}.aura-model-menu button:hover{background:color-mix(in srgb,var(--text) 5%,transparent)}.aura-model-menu button>i{width:9px;height:9px;border-radius:3px;background:linear-gradient(145deg,var(--mint),var(--blue))}.aura-model-menu button>span{display:grid;min-width:0;flex:1}.aura-model-menu strong{font-size:11px}.aura-model-menu small{color:var(--muted);font-size:9px}.aura-model-menu button>b{color:var(--mint);font-size:8px;text-transform:uppercase}
.aura-scroll{flex:1;min-height:0;overflow-y:auto;padding:16px 22px 160px;scrollbar-gutter:stable;scroll-behavior:smooth}.aura-scroll::-webkit-scrollbar{width:8px}.aura-scroll::-webkit-scrollbar-thumb{border-radius:9px;background:var(--line2)}.aura-welcome{width:min(780px,100%);margin:clamp(4vh,9vh,100px) auto 0;text-align:center;animation:auraReveal .6s ease}.aura-spark{position:relative;width:56px;height:56px;margin:0 auto 18px;border:1px solid color-mix(in srgb,var(--mint) 20%,transparent);border-radius:18px;background:radial-gradient(circle,rgba(158,245,209,.14),transparent 65%)}.aura-spark:before,.aura-spark:after,.aura-spark span{position:absolute;top:50%;left:50%;width:25px;height:4px;border-radius:9px;background:linear-gradient(90deg,#e9fff7,var(--mint));content:"";transform:translate(-50%,-50%)}.aura-spark:before{transform:translate(-50%,-50%) rotate(45deg)}.aura-spark:after{transform:translate(-50%,-50%) rotate(-45deg)}.aura-spark span{width:4px;height:25px}.aura-spark i,.aura-spark b{position:absolute;width:4px;height:4px;border-radius:50%;background:var(--blue)}.aura-spark i{top:11px;left:9px}.aura-spark b{right:8px;bottom:10px}.aura-eyebrow{display:inline-flex;align-items:center;gap:7px;color:var(--muted);font-size:8px;font-weight:700;letter-spacing:.17em}.aura-eyebrow span{width:5px;height:5px;border-radius:50%;background:var(--mint)}.aura-welcome h1{margin:12px 0 10px;font-size:clamp(32px,4vw,48px);font-weight:650;line-height:1.02;letter-spacing:-.055em}.aura-welcome h1 em{color:var(--muted);font-style:normal;font-weight:430}.aura-welcome>p:not(.aura-eyebrow){width:min(550px,92%);margin:0 auto;color:var(--muted);font-size:13px;line-height:1.7}.aura-providers{display:flex;width:fit-content;max-width:100%;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:18px auto 0;padding:7px;border:1px solid var(--line);border-radius:14px;background:color-mix(in srgb,var(--text) 2.5%,transparent)}.aura-providers>span{display:inline-flex;min-height:28px;align-items:center;gap:7px;padding:0 9px;border-radius:9px;color:var(--muted);font-size:9px}.aura-providers>span:last-child{border:1px solid color-mix(in srgb,var(--mint) 14%,transparent);background:color-mix(in srgb,var(--mint) 5%,transparent);color:var(--mint);font-weight:700;letter-spacing:.11em}.aura-providers i{width:7px;height:7px;border-radius:50%;background:var(--mint)}.aura-providers span:nth-child(2) i{background:var(--blue)}
.aura-prompts{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-top:30px}.aura-prompts button{display:flex;min-height:74px;align-items:center;gap:12px;padding:13px;border:1px solid var(--line);border-radius:16px;background:color-mix(in srgb,var(--text) 2.2%,transparent);text-align:left}.aura-prompts button:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--mint) 22%,transparent);background:color-mix(in srgb,var(--mint) 4%,transparent)}.aura-prompts button>span:first-child{display:grid;width:36px;height:36px;flex:none;place-items:center;border:1px solid var(--line);border-radius:11px;background:linear-gradient(145deg,rgba(158,245,209,.09),rgba(139,188,255,.07));color:var(--mint)}.aura-prompts button>span:nth-child(2){display:grid;min-width:0;flex:1}.aura-prompts strong{font-size:11px}.aura-prompts small{margin-top:4px;color:var(--muted);font-size:9px}.aura-prompts button>b{color:var(--muted);font-size:20px}.aura-trust{display:flex;justify-content:center;gap:18px;margin-top:20px;color:var(--muted2);font-size:8px}.aura-trust span:first-child{color:var(--muted)}
.aura-messages{display:grid;width:min(820px,100%);gap:24px;margin:8px auto 0}.aura-message{display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px;animation:auraReveal .25s ease}.aura-avatar{display:grid;width:30px;height:30px;place-items:center;border:1px solid var(--line);border-radius:10px;background:var(--panel2);color:var(--muted);font-size:9px}.aura-message.assistant .aura-avatar{color:var(--mint)}.aura-message header{display:flex;align-items:center;gap:8px;min-height:22px;margin-bottom:4px}.aura-message header strong{font-size:11px}.aura-message header span{color:var(--muted2);font-size:9px}.aura-message-body{color:color-mix(in srgb,var(--text) 92%,var(--muted));font-size:13px;line-height:1.72;white-space:pre-wrap;overflow-wrap:anywhere}.aura-copy{margin-top:7px;padding:5px 8px;border:0;border-radius:7px;background:none;color:var(--muted2);font-size:9px}.aura-copy:hover{background:color-mix(in srgb,var(--text) 4%,transparent);color:var(--text)}.aura-typing{display:inline-flex;gap:4px}.aura-typing i{width:5px;height:5px;border-radius:50%;background:var(--muted);animation:auraDot 1.1s infinite}.aura-typing i:nth-child(2){animation-delay:.14s}.aura-typing i:nth-child(3){animation-delay:.28s}
.aura-composer-wrap{position:absolute;z-index:7;right:0;bottom:0;left:0;padding:32px 22px 15px;background:linear-gradient(to top,var(--bg) 55%,transparent);pointer-events:none}.aura-composer{width:min(820px,100%);margin:auto;overflow:hidden;border:1px solid var(--line2);border-radius:19px;background:color-mix(in srgb,var(--panel) 92%,transparent);box-shadow:0 18px 70px rgba(0,0,0,.18);backdrop-filter:blur(26px);pointer-events:auto}.aura-composer:focus-within{border-color:color-mix(in srgb,var(--mint) 24%,transparent)}.aura-composer textarea{width:100%;max-height:160px;resize:none;overflow:auto;border:0;outline:0;background:transparent;padding:13px 15px 4px;color:var(--text);font-size:13px;line-height:1.55}.aura-composer textarea::placeholder{color:var(--muted2)}.aura-composer>div{display:flex;height:46px;align-items:center;gap:9px;padding:4px 8px 8px 10px}.aura-enhance{height:30px;padding:0 7px;border:0;border-radius:8px;background:none;color:var(--muted);font-size:9px}.aura-enhance:hover{background:color-mix(in srgb,var(--text) 4%,transparent);color:var(--text)}.aura-composer small{flex:1;color:var(--muted2);font-size:8px}.aura-send{display:grid;width:34px;height:34px;place-items:center;border:0;border-radius:10px;background:var(--text);color:var(--bg)!important;font-weight:800}.aura-send:disabled{opacity:.35}.aura-composer-wrap>p{margin:8px auto 0;color:var(--muted2);font-size:8px;text-align:center;pointer-events:auto}.aura-composer-wrap>p span{color:var(--muted)}.aura-error{display:flex;width:min(820px,100%);justify-content:space-between;gap:12px;margin:0 auto 8px;padding:10px 12px;border:1px solid rgba(255,143,154,.25);border-radius:11px;background:color-mix(in srgb,var(--panel) 96%,transparent);color:#ff9da7;font-size:10px;pointer-events:auto}.aura-error button{border:0;background:none;color:inherit;text-decoration:underline}
.aura-overlay{position:fixed;z-index:40;inset:0;border:0;background:rgba(0,0,0,.36);backdrop-filter:blur(4px)}.aura-settings{position:fixed;z-index:50;top:10px;right:10px;bottom:10px;width:min(390px,calc(100vw - 20px));overflow-y:auto;padding:18px;border:1px solid var(--line2);border-radius:22px;background:color-mix(in srgb,var(--panel) 97%,transparent);box-shadow:0 24px 90px rgba(0,0,0,.3);transform:translateX(calc(100% + 24px));transition:transform .28s ease}.aura-settings.open{transform:translateX(0)}.aura-settings>header{display:flex;align-items:center;justify-content:space-between;padding:3px 1px 20px;border-bottom:1px solid var(--line)}.aura-settings header small{display:block;margin-bottom:5px;color:var(--muted);font-size:8px;letter-spacing:.13em;text-transform:uppercase}.aura-settings h2{margin:0;font-size:18px}.aura-settings>label{display:block;padding:19px 2px;border-bottom:1px solid var(--line);font-size:10px;font-weight:650}.aura-settings select{width:100%;height:40px;margin-top:9px;border:1px solid var(--line);border-radius:10px;background:var(--panel2);padding:0 10px;color:var(--text);font-size:11px}.aura-settings label>span,.aura-settings label>small{display:flex;justify-content:space-between}.aura-settings output{padding:3px 7px;border:1px solid color-mix(in srgb,var(--mint) 14%,transparent);border-radius:7px;background:color-mix(in srgb,var(--mint) 7%,transparent);color:var(--mint)}.aura-settings input{width:100%;margin:12px 0 6px;accent-color:var(--mint)}.aura-settings label>small{color:var(--muted2);font-weight:400}.aura-safe{display:flex;gap:10px;margin-top:16px;padding:13px;border:1px solid color-mix(in srgb,var(--mint) 14%,transparent);border-radius:13px;background:color-mix(in srgb,var(--mint) 4%,transparent)}.aura-safe>b{display:grid;width:29px;height:29px;flex:none;place-items:center;border-radius:9px;background:color-mix(in srgb,var(--mint) 9%,transparent);color:var(--mint)}.aura-safe strong{font-size:10px}.aura-safe p{margin:4px 0 0;color:var(--muted);font-size:9px;line-height:1.5}.aura-reset{width:100%;height:39px;margin-top:18px;border:1px solid rgba(255,143,154,.2);border-radius:11px;background:rgba(255,143,154,.04);color:#ff8f9a!important;font-size:10px}.aura-mobile-menu,.aura-mobile-overlay{display:none}
@keyframes auraReveal{from{opacity:0;transform:translateY(10px)}}@keyframes auraDot{30%{transform:translateY(-3px);opacity:1}0%,60%,100%{opacity:.35}}
@media(max-width:760px){.aura-shell{display:block}.aura-sidebar{position:fixed;top:8px;bottom:8px;left:8px;width:min(286px,calc(100vw - 40px));border:1px solid var(--line2);border-radius:20px;background:color-mix(in srgb,var(--panel) 96%,transparent);box-shadow:0 24px 80px rgba(0,0,0,.3);transform:translateX(calc(-100% - 18px));transition:transform .25s ease}.aura-sidebar.aura-mobile-open{transform:translateX(0)}.aura-collapse{display:none}.aura-mobile-menu,.aura-mobile-overlay{display:grid}.aura-topbar{height:62px;padding:0 13px}.aura-status{display:none}.aura-model-pill{height:38px}.aura-model-pill small{display:none}.aura-scroll{padding:10px 13px 155px}.aura-welcome{margin-top:4vh}.aura-welcome h1{font-size:36px}.aura-prompts{grid-template-columns:1fr;margin-top:24px}.aura-prompts button{min-height:65px}.aura-trust{flex-wrap:wrap;gap:9px 14px}.aura-composer-wrap{padding:26px 10px 10px}.aura-message{grid-template-columns:29px minmax(0,1fr);gap:9px}.aura-message-body{font-size:12.5px}.aura-model-menu{width:min(310px,calc(100vw - 26px))}}
@media(max-width:430px){.aura-welcome h1{font-size:31px}.aura-prompts button:nth-child(n+4){display:none}.aura-enhance span,.aura-composer small{display:none}.aura-enhance{flex:1;text-align:left}.aura-providers span:nth-child(2){display:none}}
@media(prefers-reduced-motion:reduce){.aura-root *,.aura-root *:before,.aura-root *:after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
`;
