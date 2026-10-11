'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, RotateCcw, SkipForward } from 'lucide-react';
import { LAB_SCENARIOS, labPublicMessage, labStatusAt, labTerminalStatus, type LabModule } from '@/lib/osFounderLab';

const FINDINGS = [
  'Acceptance evidence needs review',
  'Approval boundary needs review',
  'Retry behavior needs an isolated test',
  'User-facing recovery copy needs review',
] as const;
const NOTE_KEY = 'xroga-founder-lab-fixture-notes-v1';

export function FounderScenarioLab() {
  const [module, setModule] = useState<LabModule | 'All'>('All');
  const [scenarioId, setScenarioId] = useState(LAB_SCENARIOS[0].id);
  const [persona, setPersona] = useState('Ordinary user');
  const [delay, setDelay] = useState(750);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finding, setFinding] = useState<string>(FINDINGS[0]);
  const [recorded, setRecorded] = useState<Record<string, string>>({});
  const scenario = LAB_SCENARIOS.find((item) => item.id === scenarioId) ?? LAB_SCENARIOS[0];
  const scenarios = module === 'All' ? LAB_SCENARIOS : LAB_SCENARIOS.filter((item) => item.module === module);
  const status = labStatusAt(scenario, step);
  const publicMessage = labPublicMessage(scenario);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(NOTE_KEY) ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setRecorded(Object.fromEntries(Object.entries(parsed).filter(([id, note]) =>
          LAB_SCENARIOS.some((item) => item.id === id) && FINDINGS.includes(note as typeof FINDINGS[number])
        )) as Record<string, string>);
      }
    } catch { /* A malformed local demo note is ignored; no real record exists. */ }
  }, []);
  useEffect(() => {
    if (!playing || step >= 3) return;
    const timer = window.setTimeout(() => setStep((current) => Math.min(3, current + 1)), delay);
    return () => window.clearTimeout(timer);
  }, [playing, step, delay]);
  useEffect(() => { if (step >= 3) setPlaying(false); }, [step]);

  function chooseScenario(id: string) { setScenarioId(id); setStep(0); setPlaying(false); }
  function chooseModule(value: LabModule | 'All') {
    setModule(value);
    chooseScenario((value === 'All' ? LAB_SCENARIOS : LAB_SCENARIOS.filter((item) => item.module === value))[0].id);
  }
  function reset() { setStep(0); setPlaying(false); }
  function recordFinding() {
    const next = { ...recorded, [scenario.id]: finding };
    setRecorded(next);
    try { localStorage.setItem(NOTE_KEY, JSON.stringify(next)); } catch { /* Session still shows the local selection. */ }
  }

  return <section className="os-founder-lab" aria-labelledby="scenario-lab-title">
    <div className="os-demo-banner" role="note"><CircleAlert size={17} /> SIMULATED SCENARIO · No real events, credentials, customer data, production crashes or backend requests.</div>
    <div className="os-founder-lab-heading"><div><span className="os-eyebrow">Founder fixture lab · read-only simulation</span><h2 id="scenario-lab-title">Scenario & Error Lab</h2><p>Test how a failure is explained without creating one in a user’s job. Persona changes presentation only; it never changes authorization.</p></div><span className="os-status">INTEGRATION PENDING</span></div>
    <div className="os-founder-lab-grid">
      <section className="os-panel">
        <h3>Set up the example</h3>
        <div className="os-field"><label htmlFor="lab-module">Module</label><select id="lab-module" value={module} onChange={(event) => chooseModule(event.target.value as LabModule | 'All')}><option>All</option>{Array.from(new Set(LAB_SCENARIOS.map((item) => item.module))).map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="os-field"><label htmlFor="lab-scenario">Scenario</label><select id="lab-scenario" value={scenario.id} onChange={(event) => chooseScenario(event.target.value)}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
        <div className="os-field"><label htmlFor="lab-persona">Display persona · no access change</label><select id="lab-persona" value={persona} onChange={(event) => setPersona(event.target.value)}><option>Ordinary user</option><option>Project reviewer</option><option>Founder reviewer</option></select></div>
        <div className="os-field"><label htmlFor="lab-delay">Step delay</label><select id="lab-delay" value={delay} onChange={(event) => setDelay(Number(event.target.value))}><option value={0}>Immediate</option><option value={250}>250 ms</option><option value={750}>750 ms</option></select></div>
        <p className="os-small">Expected final status: <strong>{labTerminalStatus(scenario).replaceAll('_', ' ')}</strong>{scenario.requestedStatus !== labTerminalStatus(scenario) ? ` · attempted ${scenario.requestedStatus} is rejected without evidence` : ''}.</p>
        <div className="os-actions"><button className="os-button os-button-primary" type="button" onClick={() => { setStep(0); setPlaying(true); }}>Replay scenario</button><button className="os-button" type="button" disabled={step >= 3} onClick={() => { setPlaying(false); setStep((current) => Math.min(3, current + 1)); }}><SkipForward size={15} /> Step</button><button className="os-button" type="button" disabled={!playing} onClick={() => setPlaying(false)}>Pause</button><button className="os-button" type="button" onClick={reset}><RotateCcw size={15} /> Reset</button></div>
      </section>
      <section className="os-panel">
        <span className="os-eyebrow">Before → after</span><h3 aria-live="polite">{step === 0 ? 'Ready to replay' : `Step ${step} of 3 · ${status.replaceAll('_', ' ')}`}</h3>
        <p>Before: queued example with no completed work. After: {step >= 3 ? `${status.replaceAll('_', ' ')}; no external work performed.` : 'not yet at a final state.'}</p>
        <ol className="os-list" aria-label="Simulated event timeline">{[0,1,2,3].map((index) => <li key={index}><strong>{index === 0 ? 'Queued' : index === 1 ? 'Started' : index === 2 ? 'Review or recovery' : 'Outcome gate'}</strong><small>{index <= step ? `${labStatusAt(scenario, index).replaceAll('_', ' ')} · fictional event` : 'Not reached'}</small></li>)}</ol>
        <p className="os-small">Affected deliverables: {scenario.affectedDeliverables.join(', ')}. Display persona: {persona}.</p>
      </section>
    </div>
    <div className="os-founder-lab-grid">
      <section className="os-panel"><span className="os-eyebrow">What an ordinary user could safely see</span><h3>Plain-language result</h3><ul className="os-list"><li><strong>What happened</strong><small>{publicMessage.happened}</small></li><li><strong>What was saved</strong><small>{publicMessage.saved}</small></li><li><strong>What remains</strong><small>{publicMessage.remaining}</small></li><li><strong>Safe next step</strong><small>{publicMessage.next}</small></li><li><strong>Support reference</strong><small>{publicMessage.reference} · fictional only</small></li></ul></section>
      <section className="os-panel"><span className="os-eyebrow">Restricted fixture detail · never a real event</span><h3>Redacted investigation record</h3><dl className="os-lab-facts"><div><dt>Environment / source</dt><dd>Isolated fixture · {scenario.sourceClass}</dd></div><div><dt>Time / correlation</dt><dd>Deterministic replay step {step} · LAB-{scenario.id}</dd></div><div><dt>Severity / scope</dt><dd>{scenario.severity} · fictional tenant boundary only</dd></div><div><dt>Evidence</dt><dd>{scenario.evidence.length ? scenario.evidence.join('; ') : 'No passing evidence recorded'} · {scenario.evidencePassed ? 'sample pass' : 'not passed'}</dd></div><div><dt>Redacted cause</dt><dd>{scenario.cause}</dd></div><div><dt>Retry disposition</dt><dd>{scenario.nextAction}</dd></div><div><dt>Hypothesis vs evidence</dt><dd>Cause is a fixture hypothesis; only the listed example evidence counts as recorded.</dd></div><div><dt>Real investigation links</dt><dd>Not connected. No backend event ID or trace is available.</dd></div></dl></section>
    </div>
    <section className="os-panel"><span className="os-eyebrow">Prototype finding · no free-text secrets</span><h3>Record a review note</h3><p>Choose a fixed note; this saves only a fictional label in this browser, never a real diagnostic or customer input.</p><div className="os-founder-lab-note"><div className="os-field"><label htmlFor="lab-finding">Finding</label><select id="lab-finding" value={finding} onChange={(event) => setFinding(event.target.value)}>{FINDINGS.map((item) => <option key={item}>{item}</option>)}</select></div><button className="os-button" type="button" onClick={recordFinding}><CircleCheck size={15} /> Record finding</button></div><p role="status">{recorded[scenario.id] ? `Recorded for ${scenario.title}: ${recorded[scenario.id]}` : 'No finding recorded for this scenario.'}</p></section>
  </section>;
}
