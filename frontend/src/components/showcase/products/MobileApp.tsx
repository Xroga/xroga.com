'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { productReset, readLocal, writeLocal } from './shared';

type Tab = 'today' | 'train' | 'progress' | 'coach' | 'you';
type CoachMessage = { id: string; role: 'user' | 'assistant'; text: string };

type DemoState = {
  water: number;
  steps: number;
  sets: number;
  elapsed: number;
  running: boolean;
  streak: number;
  period: '4 weeks' | '3 months' | 'Year';
};

const STORAGE_KEY = 'xroga_showcase_athlyra_v1';
const INITIAL: DemoState = { water: 1.8, steps: 8462, sets: 7, elapsed: 1542, running: false, streak: 12, period: '4 weeks' };

const COACH_ANSWERS: Record<string, string> = {
  'Plan my next workout': 'Based on your 12-day demo streak and current load, try Push + Core: 42 minutes, 8 exercises, RPE 7–8. Keep compounds controlled and finish with two core supersets.',
  'How is my recovery?': 'The sample recovery signal looks balanced, not perfect. Keep one or two reps in reserve and prioritize hydration before the session.',
  'Break my plateau': 'For the next two weeks, keep exercise selection stable and progress one variable at a time: add one rep or two kilograms, not both.',
};

const NAV: Array<{ id: Tab; icon: string; label: string }> = [
  { id: 'today', icon: '⌂', label: 'Today' },
  { id: 'train', icon: '◫', label: 'Train' },
  { id: 'progress', icon: '↗', label: 'Progress' },
  { id: 'coach', icon: '✦', label: 'Coach' },
  { id: 'you', icon: '◉', label: 'You' },
];

function Brand() {
  return <div className="at-brand"><span className="at-mark"><i>A</i><b>↯</b></span><span><strong>Athlyra</strong><small>POWERED BY XROGA AI</small></span></div>;
}

function Metric({ icon, value, label, note }: { icon: string; value: string; label: string; note?: string }) {
  return <article className="at-metric"><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div>{note ? <em>{note}</em> : null}</article>;
}

function SectionHead({ kicker, title, action, onAction }: { kicker?: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="at-section-head"><div>{kicker ? <p className="at-eyebrow">{kicker}</p> : null}<h2>{title}</h2></div>{action ? <button type="button" onClick={onAction} disabled={!onAction}>{action}</button> : null}</div>;
}

function PageHead({ kicker, title, action }: { kicker: string; title: string; action?: React.ReactNode }) {
  return <header className="at-page-head"><div><p className="at-eyebrow">{kicker}</p><h1>{title}</h1></div>{action}</header>;
}

export function MobileApp() {
  const [tab, setTab] = useState<Tab>('today');
  const [state, setState] = useState<DemoState>(INITIAL);
  const [ready, setReady] = useState(false);
  const [coachDraft, setCoachDraft] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([
    { id: 'intro', role: 'assistant', text: 'This demo uses sample activity data. Your training load looks productive; keep today’s push session around RPE 8.' },
  ]);

  useEffect(() => {
    setState(readLocal<DemoState>(STORAGE_KEY, INITIAL));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeLocal(STORAGE_KEY, state);
  }, [ready, state]);

  useEffect(() => {
    if (!state.running) return;
    const timer = window.setInterval(() => setState((value) => ({ ...value, elapsed: value.elapsed + 1 })), 1000);
    return () => window.clearInterval(timer);
  }, [state.running]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const timer = useMemo(() => `${String(Math.floor(state.elapsed / 60)).padStart(2, '0')}:${String(state.elapsed % 60).padStart(2, '0')}`, [state.elapsed]);
  const hydration = Math.min(100, (state.water / 2.8) * 100);

  function go(next: Tab) {
    setTab(next);
  }

  function sendCoach(text = coachDraft) {
    const value = text.trim();
    if (!value) return;
    const user: CoachMessage = { id: `u-${Date.now()}`, role: 'user', text: value };
    const reply = COACH_ANSWERS[value] ?? 'Use the sample trend as a guide: avoid sudden volume jumps, keep your next session slightly better than the last, and stop if pain changes your movement.';
    setCoachMessages((messages) => [...messages, user, { id: `a-${Date.now()}`, role: 'assistant', text: reply }]);
    setCoachDraft('');
  }

  return (
    <div className="at-root">
      <style>{CSS}</style>
      <div className="at-glow at-glow-one" /><div className="at-glow at-glow-two" />
      <p className="at-demo-note" role="note"><strong>Interactive product preview.</strong> Sample fitness data and a clearly labelled local coach are used here. No APK or store release is claimed.</p>
      <main className="at-phone" aria-label="Athlyra fitness tracker app preview">
        <div className="at-status"><span>09:41</span><span>●●●　◔　▰</span></div>
        <div className="at-screen">
          {tab === 'today' ? <section className="at-view" aria-label="Today dashboard">
            <header className="at-topbar"><Brand /><button type="button" className="at-icon" onClick={() => setToast('No new notifications in this demo')} aria-label="Notifications">⌁<i /></button></header>
            <div className="at-greeting"><div><p className="at-eyebrow">WEDNESDAY · AUG 12</p><h1>Move with intent.</h1></div><span className="at-streak">⚡ <b>{state.streak}</b><small>day streak</small></span></div>
            <article className="at-readiness"><div><span className="at-tag">TODAY&apos;S READINESS</span><h2>Strong day<br />to push.</h2><p>Recovery is balanced and your recent training load is on target.</p><button type="button" onClick={() => go('coach')}>Ask Xroga Coach →</button></div><span className="at-ring" style={{ '--score': 86 } as React.CSSProperties}><i><strong>86</strong><small>ENERGY</small></i></span></article>
            <div className="at-metrics"><Metric icon="↟" value={state.steps.toLocaleString()} label="steps" note="85%" /><Metric icon="◷" value="54" label="active min" note="+9%" /><Metric icon="⌁" value="620" label="kcal" note="on goal" /></div>
            <SectionHead kicker="XROGA PICK" title="Today’s session" action="View plan" onAction={() => go('train')} />
            <article className="at-workout"><div><span>UPPER · STRENGTH</span><b>42 MIN</b></div><h2>Push + Core</h2><p>8 exercises · moderate-high effort</p><div className="at-exercises"><i>P</i><i>D</i><i>C</i><i>+5</i></div><button type="button" onClick={() => { setState((value) => ({ ...value, running: true })); go('train'); }}>Start workout →</button></article>
            <SectionHead kicker="RECOVERY" title="Hydration" action={`${state.water.toFixed(2).replace(/0$/, '')} / 2.8 L`} />
            <article className="at-water"><span><i style={{ width: `${hydration}%` }} /></span><button type="button" onClick={() => setState((value) => ({ ...value, water: Math.min(2.8, value.water + 0.25) }))}>+ 250 ml</button></article>
          </section> : null}

          {tab === 'train' ? <section className="at-view" aria-label="Workout tracker">
            <PageHead kicker="ACTIVE WORKOUT" title="Push + Core" action={<button className="at-icon" type="button" onClick={() => go('today')} aria-label="Close workout">×</button>} />
            <article className="at-session"><p className="at-eyebrow">ELAPSED</p><strong className="at-timer">{timer}</strong><div><span><b>{state.sets}</b><small>SETS</small></span><span><b>2.4k</b><small>VOLUME</small></span><span><b>138</b><small>BPM</small></span></div><button type="button" onClick={() => setState((value) => ({ ...value, running: !value.running }))}>{state.running ? 'Pause' : 'Resume'}</button></article>
            <SectionHead kicker="EXERCISE 2 OF 8" title="Dumbbell press" action="3 × 10" />
            <article className="at-set-card"><div className="at-dumbbell"><i /><span>DB</span></div><div className="at-set-row at-set-head"><span>SET</span><span>KG</span><span>REPS</span><span /></div><div className="at-set-row done"><span>1</span><span>24</span><span>10</span><button type="button" aria-label="Set 1 complete">✓</button></div><div className="at-set-row done"><span>2</span><span>24</span><span>10</span><button type="button" aria-label="Set 2 complete">✓</button></div><div className="at-set-row"><span>3</span><input aria-label="Set 3 kilograms" defaultValue="24" inputMode="decimal" /><input aria-label="Set 3 repetitions" defaultValue="10" inputMode="numeric" /><button type="button" aria-label="Log set" onClick={() => { setState((value) => ({ ...value, sets: value.sets + 1 })); setToast('Set logged'); }}>+</button></div></article>
            <aside className="at-coach-nudge"><span>✦</span><div><strong>Xroga Coach</strong><p>Your reps are steady. Keep 24 kg and leave 1–2 reps in reserve.</p><small>LOCAL DEMO GUIDANCE</small></div></aside>
            <SectionHead title="Up next" action="6 exercises" />
            <div className="at-list">{['Incline press · 3 × 8', 'Cable fly · 3 × 12', 'Plank reach · 3 × 40 sec'].map((exercise) => <button type="button" key={exercise} onClick={() => setToast(`${exercise} opened`)}><i>◇</i><span>{exercise}</span><b>›</b></button>)}</div>
            <button className="at-finish" type="button" onClick={() => { setState((value) => ({ ...value, running: false, streak: Math.max(value.streak, 13) })); setToast('Workout saved to this demo'); go('progress'); }}>Finish workout</button>
          </section> : null}

          {tab === 'progress' ? <section className="at-view" aria-label="Fitness progress">
            <PageHead kicker="YOUR DEMO DATA" title="Progress" />
            <div className="at-segment" role="group" aria-label="Progress range">{(['4 weeks', '3 months', 'Year'] as const).map((period) => <button type="button" key={period} className={state.period === period ? 'active' : ''} aria-pressed={state.period === period} onClick={() => setState((value) => ({ ...value, period }))}>{period}</button>)}</div>
            <article className="at-chart-card"><header><div><p className="at-eyebrow">BODY WEIGHT</p><h2>72.4 <small>kg</small></h2></div><span>↓ 1.8 kg</span></header><svg viewBox="0 0 360 145" role="img" aria-label="Sample four-week weight trend"><path d="M0 30 C36 36 44 56 80 54 S128 82 168 70 S220 103 254 91 S316 122 360 111" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg><div className="at-axis"><span>JUL 16</span><span>JUL 30</span><span>AUG 12</span></div></article>
            <div className="at-metrics at-progress-metrics"><Metric icon="⌁" value="18" label="workouts" note="+3" /><Metric icon="↗" value="84%" label="consistency" note="+7%" /><Metric icon="◆" value="31.6k" label="kg volume" note="+12%" /></div>
            <SectionHead kicker="THIS WEEK" title="Activity load" action="On target" />
            <article className="at-bars">{[48, 76, 92, 35, 64, 15, 15].map((height, index) => <span key={`${height}-${index}`}><i className={index === 2 ? 'active' : ''} style={{ height: `${height}%` }} /><small>{['M','T','W','T','F','S','S'][index]}</small></span>)}</article>
            <article className="at-milestone"><span>🏆</span><div><small>NEW DEMO MILESTONE</small><strong>{state.streak}-day movement streak</strong><p>Your longest sample streak this quarter.</p></div></article>
          </section> : null}

          {tab === 'coach' ? <section className="at-view at-coach-view" aria-label="Xroga fitness coach">
            <PageHead kicker="POWERED BY XROGA AI" title="Coach" action={<span className="at-demo-live">● LOCAL DEMO</span>} />
            <div className="at-coach-hero"><span>✦</span><p className="at-eyebrow">ATHLYRA INTELLIGENCE</p><h2>What should we<br />work on today?</h2><p>This preview uses deterministic local guidance with sample workout and recovery context. It does not call a live model.</p></div>
            <div className="at-prompts">{Object.keys(COACH_ANSWERS).map((prompt) => <button type="button" key={prompt} onClick={() => sendCoach(prompt)}>{prompt}</button>)}</div>
            <div className="at-chat" aria-live="polite">{coachMessages.map((message) => <div key={message.id} className={`at-message ${message.role}`}>{message.role === 'assistant' ? <span>✦</span> : null}<p>{message.text}</p></div>)}</div>
            <form className="at-coach-form" onSubmit={(event: FormEvent) => { event.preventDefault(); sendCoach(); }}><input value={coachDraft} onChange={(event) => setCoachDraft(event.target.value)} placeholder="Ask about training or recovery…" aria-label="Ask Xroga Coach" /><button type="submit" aria-label="Send coach message">↑</button></form>
            <p className="at-privacy">Demo guidance is not medical advice. Production integrations require authentication and consent.</p>
          </section> : null}

          {tab === 'you' ? <section className="at-view" aria-label="Athlyra profile">
            <PageHead kicker="LOCAL DEMO PROFILE" title="You" />
            <article className="at-profile"><span>DA</span><div><strong>Demo Athlete</strong><small>Intermediate · Strength + conditioning</small></div><button type="button" onClick={() => setToast('Profile editing belongs in the generated app')}>Edit</button></article>
            <div className="at-profile-stats"><span><strong>{state.streak}</strong><small>STREAK</small></span><span><strong>72.4</strong><small>KG</small></span><span><strong>4</strong><small>SESSIONS/WK</small></span></div>
            <SectionHead title="Goals" action="Manage" onAction={() => setToast('Goal manager opened')} />
            <article className="at-goal"><span><i>68%</i></span><div><p className="at-eyebrow">PRIMARY GOAL</p><strong>Build strength</strong><small>4 workouts/week · 7,500 steps/day</small></div></article>
            <SectionHead title="Connected health" />
            <div className="at-list at-health"><button type="button" onClick={() => setToast('Pedometer is simulated in the browser preview')}><i>♥</i><span><strong>Pedometer sensor</strong><small>Android activity recognition</small></span><em>PREVIEW</em></button><button type="button" onClick={() => setToast('Cloud sync is not connected in this preview')}><i>☁</i><span><strong>Supabase sync</strong><small>Auth + database + Edge Function ready</small></span><em>DEMO</em></button></div>
            <p className="at-powered">Built for showcase by <strong>Xroga AI</strong> · Athlyra v1.0</p>
          </section> : null}
        </div>
        <nav className="at-nav" aria-label="App tabs">{NAV.map((item) => <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} aria-label={item.label} aria-current={tab === item.id ? 'page' : undefined} onClick={() => go(item.id)}><span aria-hidden>{item.icon}</span><small aria-hidden>{item.label}</small></button>)}</nav>
      </main>
      {toast ? <div className="at-toast" role="status">{toast}</div> : null}
    </div>
  );
}

const CSS = `
${productReset('.at-root')}
.at-root{--bg:#090b09;--surface:#111411;--surface2:#171b17;--text:#f5f7ef;--muted:#92998e;--line:#292f28;--lime:#d9ff66;--ink:#11150d;position:relative;display:grid;min-height:100dvh;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% -20%,#20291d 0,transparent 36%),#070907;padding:24px;color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.at-root button,.at-root input{font:inherit}.at-root button{cursor:pointer}.at-glow{position:fixed;border-radius:999px;filter:blur(100px);opacity:.13;pointer-events:none}.at-glow-one{width:480px;height:480px;left:-260px;top:30%;background:#a4ff4f}.at-glow-two{width:380px;height:380px;right:-220px;top:8%;background:#cfff63}.at-demo-note{position:fixed;top:18px;left:18px;width:260px;margin:0;padding:11px 13px;border:1px solid var(--line);border-radius:14px;background:#0d100de8;color:var(--muted);font-size:9px;line-height:1.5;z-index:20}.at-demo-note strong{color:var(--text)}
.at-phone{position:relative;width:min(100%,430px);height:min(920px,calc(100dvh - 36px));min-height:700px;overflow:hidden;border:1px solid #272c26;border-radius:44px;background:linear-gradient(180deg,#0c0f0c,#090b09 65%);box-shadow:0 24px 80px rgba(0,0,0,.48)}.at-status{display:flex;height:42px;align-items:flex-start;justify-content:space-between;padding:14px 24px 0;font-size:10px;font-weight:800}.at-status span:last-child{font-size:7px}.at-screen{position:absolute;inset:42px 0 80px}.at-view{height:100%;overflow-y:auto;padding:8px 18px 30px;scrollbar-width:none}.at-view::-webkit-scrollbar{display:none}.at-topbar,.at-page-head{display:flex;align-items:center;justify-content:space-between;margin:2px 0 22px}.at-brand{display:flex;align-items:center;gap:9px}.at-brand>span:last-child{display:grid}.at-brand strong{font-size:17px;letter-spacing:-.5px}.at-brand small{margin-top:1px;color:var(--muted);font-size:7px;font-weight:800;letter-spacing:1.4px}.at-mark{position:relative;display:grid;width:38px;height:38px;place-items:center;border:1px solid var(--line);border-radius:11px;background:#111311}.at-mark i{color:var(--lime);font-size:21px;font-style:normal;font-weight:950}.at-mark b{position:absolute;color:var(--text);font-size:10px}.at-icon{position:relative;width:38px;height:38px;border:1px solid var(--line);border-radius:13px;background:var(--surface);color:var(--text);font-size:17px}.at-icon i{position:absolute;top:8px;right:8px;width:6px;height:6px;border-radius:50%;background:var(--lime)}.at-eyebrow{margin:0;color:var(--muted);font-size:8px;font-weight:850;letter-spacing:1.2px;text-transform:uppercase}.at-greeting{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:18px}.at-greeting h1,.at-page-head h1{margin:6px 0 0;font-size:31px;line-height:1;letter-spacing:-1.6px}.at-streak{display:grid;min-width:82px;grid-template-columns:18px auto;grid-template-rows:auto auto;padding:9px 12px;border:1px solid var(--line);border-radius:20px;background:var(--surface);font-size:17px}.at-streak>b{font-size:14px}.at-streak small{color:var(--muted);font-size:8px}.at-readiness{position:relative;display:flex;min-height:245px;align-items:flex-end;overflow:hidden;padding:22px;border:1px solid #2b3328;border-radius:32px;background:linear-gradient(145deg,#1d231b,#131713 58%,#202a1b)}.at-readiness:after{position:absolute;top:-55px;right:-70px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,#caff5a33,transparent 68%);content:""}.at-readiness>div{z-index:2;width:57%}.at-tag{display:inline-flex;padding:5px 8px;border-radius:99px;background:#d9ff6615;color:var(--lime);font-size:7px;font-weight:900;letter-spacing:1px}.at-readiness h2{margin:13px 0 10px;font-size:31px;line-height:1.02;letter-spacing:-1.6px}.at-readiness p{margin:0 0 16px;color:#a3aa9e;font-size:10px;line-height:1.45}.at-readiness button{border:0;background:none;padding:0;color:var(--text);font-size:9px;font-weight:850}.at-ring{--score:86;position:absolute;z-index:2;top:44px;right:18px;width:128px;height:128px;padding:9px;border-radius:50%;background:conic-gradient(var(--lime) calc(var(--score)*1%),#2a3028 0);transform:rotate(20deg)}.at-ring:before{position:absolute;inset:10px;border-radius:50%;background:#171b16;content:""}.at-ring i{position:absolute;inset:0;display:grid;place-content:center;text-align:center;transform:rotate(-20deg)}.at-ring strong{font-size:36px;letter-spacing:-2px}.at-ring small{color:var(--muted);font-size:8px;letter-spacing:1px}.at-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 24px}.at-metric{position:relative;display:grid;min-width:0;min-height:92px;grid-template-columns:28px 1fr;grid-template-rows:1fr auto;padding:13px;border:1px solid var(--line);border-radius:22px;background:var(--surface)}.at-metric>span{display:grid;width:26px;height:26px;place-items:center;border-radius:9px;background:#d9ff6610;color:var(--lime);font-weight:900}.at-metric>div{display:flex;align-self:center;flex-direction:column;min-width:0}.at-metric strong{overflow:hidden;font-size:15px;letter-spacing:-.4px;text-overflow:ellipsis}.at-metric small{color:var(--muted);font-size:7px;letter-spacing:.5px;text-transform:uppercase}.at-metric em{grid-column:1/3;margin-top:8px;color:#9fa69a;font-size:7px;font-style:normal}.at-section-head{display:flex;align-items:flex-end;justify-content:space-between;margin:20px 2px 10px}.at-section-head h2{margin:4px 0 0;font-size:19px;letter-spacing:-.7px}.at-section-head button{padding:7px 9px;border:1px solid var(--line);border-radius:10px;background:none;color:#c6cbc1;font-size:8px}.at-section-head button:disabled{opacity:1}.at-workout{padding:21px;border-radius:30px;background:linear-gradient(145deg,#d9ff66,#bfe94f);color:#10140b}.at-workout>div:first-child{display:flex;justify-content:space-between}.at-workout>div:first-child span{padding:5px 8px;border-radius:99px;background:#11170e12;color:#253011;font-size:7px;font-weight:900;letter-spacing:1px}.at-workout>div:first-child b{font-size:8px;letter-spacing:1px}.at-workout h2{margin:18px 0 3px;font-size:28px;letter-spacing:-1.4px}.at-workout p{margin:0;color:#3d4930;font-size:9px}.at-exercises{display:flex!important;justify-content:flex-start!important;margin:16px 0}.at-exercises i{display:grid;width:32px;height:32px;margin-right:-6px;place-items:center;border:2px solid #c7ef57;border-radius:50%;background:#161b12;color:var(--lime);font-size:9px;font-style:normal;font-weight:900}.at-exercises i:last-child{background:#efffc0;color:#232c18}.at-workout>button{width:100%;height:50px;border:0;border-radius:17px;background:#11150e;color:#f4f7ed;font-size:11px;font-weight:900}.at-water{display:flex;align-items:center;gap:10px;padding:14px;border:1px solid var(--line);border-radius:22px;background:var(--surface)}.at-water>span{height:8px;flex:1;overflow:hidden;border-radius:99px;background:#252b24}.at-water i{display:block;height:100%;border-radius:inherit;background:var(--lime);transition:width .3s}.at-water button{padding:9px 11px;border:1px solid #3a4435;border-radius:13px;background:#1b2119;color:var(--lime);font-size:8px;font-weight:900}
.at-page-head{align-items:flex-start}.at-session{padding:20px;border:1px solid #30382c;border-radius:28px;background:linear-gradient(145deg,#1b2119,#111510)}.at-timer{display:block;margin-top:4px;font-size:43px;letter-spacing:-2.5px}.at-session>div{display:grid;grid-template-columns:repeat(3,1fr);margin:20px 0 14px}.at-session>div span{display:flex;flex-direction:column;border-right:1px solid var(--line)}.at-session>div span:last-child{border:0}.at-session>div b{font-size:17px}.at-session>div small{color:var(--muted);font-size:7px}.at-session>button{width:100%;height:45px;border:1px solid #495144;border-radius:14px;background:#252d22;color:var(--text);font-weight:900}.at-set-card{overflow:hidden;border:1px solid var(--line);border-radius:27px;background:var(--surface)}.at-dumbbell{position:relative;display:grid;height:92px;place-items:center;background:radial-gradient(circle,#d9ff661f,transparent 35%),linear-gradient(120deg,#181e16,#232b20)}.at-dumbbell i{position:absolute;right:10%;left:10%;height:1px;background:#d9ff6630}.at-dumbbell span{z-index:1;display:grid;width:46px;height:46px;place-items:center;border-radius:15px;background:var(--lime);color:var(--ink);font-weight:950}.at-set-row{display:grid;height:44px;grid-template-columns:40px 1fr 1fr 38px;align-items:center;gap:8px;margin:0 13px;border-bottom:1px solid #222721;font-size:10px;text-align:center}.at-set-head{height:30px;color:var(--muted);font-size:7px;font-weight:800}.at-set-row input{width:100%;height:30px;border:1px solid #353d32;border-radius:9px;background:#1b201a;color:var(--text);text-align:center}.at-set-row button{width:28px;height:28px;border:0;border-radius:9px;background:#263022;color:var(--lime);font-weight:900}.at-set-row.done button{background:var(--lime);color:var(--ink)}.at-coach-nudge{display:flex;gap:12px;margin-top:10px;padding:14px;border:1px solid #d9ff6624;border-radius:21px;background:#d9ff660b}.at-coach-nudge>span{display:grid;width:34px;height:34px;flex:none;place-items:center;border-radius:12px;background:var(--lime);color:var(--ink);font-weight:950}.at-coach-nudge strong{font-size:10px}.at-coach-nudge p{margin:3px 0;color:#adb5aa;font-size:9px;line-height:1.4}.at-coach-nudge small{color:#76806f;font-size:6px;letter-spacing:1px}.at-list{padding:0 13px;border:1px solid var(--line);border-radius:24px;background:var(--surface)}.at-list button{display:flex;width:100%;min-height:60px;align-items:center;gap:10px;border:0;border-bottom:1px solid #242924;background:none;color:var(--text);text-align:left}.at-list button:last-child{border:0}.at-list button>i{display:grid;width:34px;height:34px;flex:none;place-items:center;border-radius:11px;background:#20261f;color:var(--lime);font-style:normal}.at-list button>span{display:grid;flex:1;font-size:9px;font-weight:800}.at-list button>b{color:#666e63}.at-finish{width:100%;height:48px;margin-top:14px;border:1px solid #413431;border-radius:16px;background:#1e1514;color:#ffaaa1;font-weight:900}
.at-segment{display:grid;grid-template-columns:repeat(3,1fr);margin-bottom:12px;padding:4px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}.at-segment button{height:32px;border:0;border-radius:11px;background:none;color:var(--muted);font-size:8px;font-weight:900}.at-segment button.active{background:#282f26;color:var(--text)}.at-chart-card,.at-bars{padding:18px;border:1px solid var(--line);border-radius:27px;background:var(--surface)}.at-chart-card header{display:flex;align-items:flex-start;justify-content:space-between}.at-chart-card h2{margin:4px 0 0;font-size:32px}.at-chart-card h2 small{color:var(--muted);font-size:13px}.at-chart-card header>span{padding:7px 9px;border-radius:99px;background:#a9ff8a0d;color:#a9ff8a;font-size:9px;font-weight:900}.at-chart-card svg{width:100%;height:140px;color:var(--lime)}.at-axis{display:flex;justify-content:space-between;color:#71786f;font-size:7px;font-weight:900}.at-progress-metrics .at-metric{min-height:118px}.at-bars{display:grid;height:170px;grid-template-columns:repeat(7,1fr);gap:10px;align-items:end}.at-bars>span{display:flex;height:100%;flex-direction:column;justify-content:flex-end;align-items:center;gap:7px}.at-bars i{width:18px;min-height:10px;border-radius:99px;background:#313831}.at-bars i.active{background:var(--lime);box-shadow:0 0 30px #d9ff6621}.at-bars small{color:var(--muted);font-size:7px}.at-milestone{display:flex;gap:12px;margin-top:12px;padding:15px;border:1px solid #39301b;border-radius:23px;background:linear-gradient(135deg,#262213,#171a14)}.at-milestone>span{font-size:26px}.at-milestone div{display:flex;flex-direction:column}.at-milestone small{color:#d9bd62;font-size:7px;font-weight:900;letter-spacing:1px}.at-milestone strong{margin-top:3px;font-size:11px}.at-milestone p{margin:2px 0 0;color:var(--muted);font-size:8px}
.at-demo-live{padding:7px 10px;border:1px solid #334030;border-radius:99px;color:#a9ff8a;font-size:7px;font-weight:900}.at-coach-hero{padding:20px 14px 10px;text-align:center}.at-coach-hero>span{display:grid;width:62px;height:62px;margin:0 auto 15px;place-items:center;border-radius:22px;background:var(--lime);box-shadow:0 0 50px #d9ff6621;color:var(--ink);font-size:24px;font-weight:950}.at-coach-hero h2{margin:8px 0;font-size:31px;line-height:1.02;letter-spacing:-1.6px}.at-coach-hero>p:last-child{max-width:300px;margin:0 auto;color:var(--muted);font-size:9px;line-height:1.5}.at-prompts{display:flex;gap:7px;overflow-x:auto;padding:14px 0;scrollbar-width:none}.at-prompts button{padding:9px 12px;border:1px solid var(--line);border-radius:99px;background:var(--surface);color:#c8cec4;font-size:8px;white-space:nowrap}.at-chat{display:flex;min-height:170px;flex-direction:column;gap:10px}.at-message{display:flex;max-width:86%;gap:9px;padding:12px 13px;border-radius:19px;font-size:9px;line-height:1.48}.at-message p{margin:0}.at-message.assistant{align-self:flex-start;border:1px solid #2b3427;background:#171d15}.at-message.assistant span{color:var(--lime)}.at-message.user{align-self:flex-end;background:var(--lime);color:var(--ink)}.at-coach-form{position:sticky;bottom:-30px;display:flex;gap:7px;padding:12px 0 6px;background:#0a0c09}.at-coach-form input{height:48px;min-width:0;flex:1;border:1px solid #30362e;border-radius:16px;outline:0;background:var(--surface);padding:0 14px;color:var(--text);font-size:9px}.at-coach-form button{width:48px;border:0;border-radius:16px;background:var(--lime);color:var(--ink);font-size:20px;font-weight:900}.at-privacy{padding:4px 20px;color:#687067;font-size:7px;text-align:center}
.at-profile{display:flex;align-items:center;gap:12px;padding:15px;border:1px solid var(--line);border-radius:24px;background:var(--surface)}.at-profile>span{display:grid;width:48px;height:48px;place-items:center;border-radius:17px;background:linear-gradient(145deg,var(--lime),#7ea43a);color:var(--ink);font-size:13px;font-weight:950}.at-profile>div{display:grid;min-width:0;flex:1}.at-profile strong{font-size:12px}.at-profile small{margin-top:3px;color:var(--muted);font-size:8px}.at-profile>button{padding:8px 10px;border:1px solid #323831;border-radius:11px;background:#1a1f19;color:#cbd1c6;font-size:8px}.at-profile-stats{display:grid;grid-template-columns:repeat(3,1fr);margin:10px 0;padding:13px;border:1px solid var(--line);border-radius:22px;background:var(--surface)}.at-profile-stats span{display:flex;align-items:center;flex-direction:column;border-right:1px solid var(--line)}.at-profile-stats span:last-child{border:0}.at-profile-stats strong{font-size:16px}.at-profile-stats small{color:var(--muted);font-size:7px}.at-goal{display:flex;align-items:center;gap:15px;padding:16px;border:1px solid #36402f;border-radius:24px;background:linear-gradient(135deg,#d9ff6613,#151a13)}.at-goal>span{display:grid;width:58px;height:58px;place-items:center;border-radius:50%;background:conic-gradient(var(--lime) 68%,#283027 0)}.at-goal>span i{display:grid;width:46px;height:46px;place-items:center;border-radius:50%;background:#151a13;font-size:10px;font-style:normal;font-weight:900}.at-goal>div{display:flex;flex-direction:column}.at-goal>div strong{margin-top:4px;font-size:12px}.at-goal>div small{margin-top:3px;color:var(--muted);font-size:8px}.at-health button>span{font-weight:400}.at-health button>span strong{font-size:10px}.at-health button>span small{margin-top:2px;color:var(--muted);font-size:7px}.at-health em{color:#a9ff8a;font-size:7px;font-style:normal;font-weight:900}.at-powered{margin-top:20px;color:#646b62;font-size:8px;text-align:center}.at-powered strong{color:#b4bbaf}
.at-nav{position:absolute;z-index:10;right:0;bottom:0;left:0;display:grid;height:80px;grid-template-columns:repeat(5,1fr);padding:8px 12px 14px;border-top:1px solid #222821;background:#0c0f0cee;backdrop-filter:blur(20px)}.at-nav button{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px;border:0;background:none;color:#71786e;font-size:18px}.at-nav span{display:grid;width:34px;height:28px;place-items:center;border-radius:12px}.at-nav small{font-size:7px;font-weight:800}.at-nav button.active{color:var(--text)}.at-nav button.active span{background:#d9ff6618;color:var(--lime)}.at-toast{position:fixed;z-index:40;bottom:28px;left:50%;padding:10px 14px;border:1px solid #3a4237;border-radius:12px;background:#181c17;color:var(--text);box-shadow:0 14px 50px #0008;font-size:9px;transform:translateX(-50%)}
@media(max-width:760px){.at-demo-note{display:none}}
@media(max-width:520px){.at-root{padding:0}.at-phone{width:100vw;height:100dvh;min-height:0;border:0;border-radius:0}.at-view{padding-right:16px;padding-left:16px}.at-status{padding-right:22px;padding-left:22px}}
@media(prefers-reduced-motion:reduce){.at-root *,.at-root *:before,.at-root *:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;
