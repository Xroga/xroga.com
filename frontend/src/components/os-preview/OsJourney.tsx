'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CirclePause, CirclePlay, ClipboardCheck, ExternalLink, Info, RotateCcw, SkipForward } from 'lucide-react';
import { OsPreviewShell } from './OsPreviewShell';
import { PREVIEW_FIXTURES, advancePreviewRun, createPreviewReceipt, createPreviewRun, type PreviewEnding, type PreviewScenario } from '@/lib/osPreview';

const SCENARIOS: Array<{ id: PreviewScenario; label: string }> = [
  { id: 'clinic', label: 'Clinic booking website' },
  { id: 'code-repair', label: 'Developer code repair' },
  { id: 'crm-operations', label: 'CRM and browser operations' },
];
const ENDINGS: Array<{ id: PreviewEnding; label: string }> = [
  { id: 'verified', label: 'Sample path completes' },
  { id: 'needs-approval', label: 'Needs approval' },
  { id: 'partially-complete', label: 'Partially complete' },
  { id: 'unable-to-complete', label: 'Unable to complete' },
];

const outcomeCopy: Record<PreviewEnding, string> = {
  verified: 'The sample path reached its simulated end. Real acceptance evidence is still required before any actual release.',
  'needs-approval': 'A real run would stop and request explicit approval before using connected services. Review permissions in the current workspace before continuing.',
  'partially-complete': 'Some sample steps reached a review point. A real run would show outstanding tasks and ask for a decision before continuing.',
  'unable-to-complete': 'The sample stopped safely. In a real run, review the scope and try again when the required context is available.',
};

export function OsJourney() {
  const [scenario, setScenario] = useState<PreviewScenario>('clinic');
  const [ending, setEnding] = useState<PreviewEnding>('verified');
  const [goal, setGoal] = useState(PREVIEW_FIXTURES.clinic.goal);
  const [constraints, setConstraints] = useState(PREVIEW_FIXTURES.clinic.constraints.join('\n'));
  const [reviewed, setReviewed] = useState(false);
  const [run, setRun] = useState(() => createPreviewRun('clinic'));

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('scenario');
    if (requested === 'code-repair' || requested === 'crm-operations') changeScenario(requested);
    // URL seeding is one-time; subsequent changes are controlled by the selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (run.paused || run.step === 0 || run.step >= 4) return;
    const timer = window.setTimeout(() => setRun((current) => advancePreviewRun(current)), 1250);
    return () => window.clearTimeout(timer);
  }, [run]);

  const fixture = PREVIEW_FIXTURES[scenario];
  const receipt = createPreviewReceipt(run);

  function changeScenario(next: PreviewScenario) {
    setScenario(next);
    setGoal(PREVIEW_FIXTURES[next].goal);
    setConstraints(PREVIEW_FIXTURES[next].constraints.join('\n'));
    setReviewed(false);
    setRun(createPreviewRun(next));
  }

  function start() { if (reviewed) setRun({ ...advancePreviewRun(createPreviewRun(scenario, ending)), paused: false }); }
  function reset() { setRun(createPreviewRun(scenario, ending)); setReviewed(false); }

  return <OsPreviewShell context="Interactive journey">
    <div className="os-page-heading"><span className="os-status os-status--interactive-preview">Interactive preview</span><h1>See the work before it happens.</h1><p className="os-lead">Shape a request, review the plan, and step through a fully local example. Every event and receipt below is simulated.</p></div>
    <div className="os-demo-banner" role="note"><Info size={18} /> Demo experience — no real work or external changes are performed.</div>
    <div className="os-journey-steps" aria-label="Journey stages">{['Define outcome','Review plan','Permissions','Simulate','Inspect result'].map((step, index) => <span className={`os-step-pill ${index === (run.step === 0 ? 0 : run.step === 4 ? 4 : 3) ? 'is-current' : ''}`} key={step}>{String(index + 1).padStart(2,'0')} {step}</span>)}</div>

    <div className="os-split">
      <div>
        <section className="os-panel"><span className="os-eyebrow">01 / Define</span><h2 style={{ marginTop: 11 }}>What should the outcome be?</h2><div className="os-field"><label htmlFor="os-scenario">Example</label><select id="os-scenario" value={scenario} onChange={(event) => changeScenario(event.target.value as PreviewScenario)}>{SCENARIOS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><div className="os-field"><label htmlFor="os-goal">Goal</label><textarea id="os-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={320} disabled={run.step > 0} /></div><div className="os-field"><label htmlFor="os-constraints">Constraints — one per line</label><textarea id="os-constraints" value={constraints} onChange={(event) => setConstraints(event.target.value)} maxLength={500} disabled={run.step > 0} /></div><p className="os-small">Your edits stay in this page. The fixture plan below is an example, not a generated answer to your custom text.</p></section>
        <section className="os-panel"><span className="os-eyebrow">02 / Outcome contract</span><h2 style={{ marginTop: 11 }}>A plan you can inspect</h2><p><strong>Goal:</strong> {goal.trim() || 'Add a goal to continue.'}</p><h3>Deliverables</h3><ul className="os-list">{fixture.deliverables.map((item) => <li key={item.id}><strong>{item.title}</strong><small>{item.detail}</small></li>)}</ul><h3 style={{ marginTop: 20 }}>Acceptance criteria</h3><ul className="os-list">{fixture.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul><details style={{ marginTop: 17 }}><summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Constraints and scope</summary><ul className="os-list">{constraints.split('\n').filter(Boolean).map((constraint, index) => <li key={`${index}-${constraint}`}>{constraint}</li>)}</ul></details></section>
        <section className="os-panel"><span className="os-eyebrow">03 / Proposed work</span><h2 style={{ marginTop: 11 }}>Sequence, not a black box</h2><ol className="os-list" style={{ paddingLeft: 0 }}>{fixture.tasks.map((task, index) => <li key={task.id}><strong>{String(index + 1).padStart(2,'0')} · {task.title}</strong><small>{task.role} · {task.description}</small><details><summary className="os-small" style={{ cursor: 'pointer' }}>Advanced detail</summary><small>Depends on: {task.dependsOn.length ? task.dependsOn.join(', ') : 'none'} · Example task ID: {task.id}</small></details></li>)}</ol><p className="os-small">{fixture.budget.label}: {fixture.budget.amount} {fixture.budget.unit}. This is a demo number, not usage or a quote.</p></section>
      </div>
      <div>
        <section className="os-panel"><span className="os-eyebrow">04 / Permission review</span><h2 style={{ marginTop: 11 }}>You stay in control.</h2><p>These would require authorization in a real run. This preview does not ask for or grant any access.</p><ul className="os-list">{fixture.approvals.map((approval) => <li key={approval.id}><strong>{approval.service}</strong><small>{approval.reason}</small></li>)}</ul><label style={{ display: 'flex', alignItems: 'start', gap: 10, marginTop: 18, fontSize: 12, lineHeight: 1.5, cursor: 'pointer' }}><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} disabled={run.step > 0} style={{ marginTop: 2 }} /> I understand that this is a demo; no permission is granted and no external action occurs.</label></section>
        <section className="os-panel"><span className="os-eyebrow">05 / Simulated run</span><h2 style={{ marginTop: 11 }}>Advance the example</h2><div className="os-field"><label htmlFor="os-ending">Explore an outcome</label><select id="os-ending" value={ending} onChange={(event) => { const value = event.target.value as PreviewEnding; setEnding(value); setRun(createPreviewRun(scenario, value)); }} disabled={run.step > 0}>{ENDINGS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div><p className="os-small">The selected ending is predetermined. It does not reflect real service or provider state.</p><div className="os-actions" style={{ marginTop: 16 }}><button type="button" className="os-button os-button-primary" onClick={start} disabled={!reviewed || !goal.trim() || run.step > 0}><CirclePlay size={16} /> Simulate run</button>{run.step > 0 && run.step < 4 ? <><button type="button" className="os-button" onClick={() => setRun((current) => ({ ...current, paused: !current.paused }))}>{run.paused ? <CirclePlay size={16} /> : <CirclePause size={16} />}{run.paused ? 'Resume' : 'Pause'}</button><button type="button" className="os-button" onClick={() => setRun((current) => advancePreviewRun({ ...current, paused: true }))}><SkipForward size={16} /> Step</button></> : null}{run.step === 4 ? <button type="button" className="os-button" onClick={() => setRun({ ...advancePreviewRun(createPreviewRun(scenario, ending)), paused: false })}><RotateCcw size={16} /> Replay</button> : null}<button type="button" className="os-button" onClick={reset} disabled={run.step === 0 && !reviewed}><RotateCcw size={16} /> Reset</button></div><p role="status" aria-live="polite" style={{ fontWeight: 700, marginTop: 18 }}>Status: {run.status.replaceAll('-', ' ')} {run.step > 0 ? '(simulated)' : ''}</p></section>
        <section className="os-panel"><span className="os-eyebrow">Event timeline</span>{run.events.length ? <ol className="os-timeline" style={{ marginTop: 21 }}>{run.events.map((event) => <li className="os-timeline-item" key={event.id}><strong>{event.title}</strong><p>{event.detail}</p><details><summary className="os-small" style={{ cursor: 'pointer' }}>Event detail</summary><p className="os-small">Step {event.step} · {event.status} · {event.id}</p></details></li>)}</ol> : <div className="os-empty-state" style={{ marginTop: 15, padding: '29px 15px' }}><CirclePause size={24} /><h2>Ready when you are</h2><p>Review the permissions above, then start the sample run.</p></div>}</section>
      </div>
    </div>
    <section className="os-section" style={{ marginTop: 24 }}><div className="os-section-head"><div><span className="os-eyebrow">06 / Result</span><h2>Show the work and the proof gap.</h2></div><p>Only real execution can satisfy these evidence requirements. The preview is explicit about what remains unverified.</p></div><div className="os-split"><div className="os-panel"><h2>{fixture.artifact.title}</h2><p>{fixture.artifact.summary}</p><div className="os-preview-mock" aria-label="Sample artifact concept"><header>EXAMPLE ARTIFACT · NOT DEPLOYED</header><div className="os-preview-mock-body">{scenario === 'clinic' ? <><span className="os-eyebrow">Sample clinic</span><h3>Care, on your schedule.</h3><p>Sample appointment slots illustrate the design direction.</p><div className="os-mock-slots"><span>Monday · 10:00</span><span>Tuesday · 14:30</span><span>Friday · 09:15</span></div></> : <><span className="os-eyebrow">{fixture.artifact.kind} concept</span><h3>{fixture.artifact.title}</h3><p>{fixture.artifact.summary}</p></>}</div></div></div><div className="os-panel"><h2>Evidence required for real work</h2><ul className="os-list">{fixture.evidence.map((evidence) => <li key={evidence.id}><strong>{evidence.title} · NOT EXECUTED</strong><small>{evidence.requirement}</small></li>)}</ul></div></div>{receipt ? <div className="os-receipt" role="status" style={{ marginTop: 18 }}><span className="os-receipt-label">{receipt.label}</span><h3 style={{ margin: '9px 0' }}>{receipt.status.replaceAll('-', ' ')} · simulated outcome</h3><p style={{ fontSize: 13, lineHeight: 1.6 }}>{outcomeCopy[ending]}</p><p className="os-small">External changes: {receipt.actualExternalChanges}. Real evidence collected: 0. This receipt is a demonstration only.</p></div> : <div className="os-demo-banner" style={{ marginTop: 18 }}><ClipboardCheck size={18} /> No receipt yet. Run the simulation to see a labelled example result.</div>}</section>
    <div className="os-actions"><Link className="os-button" href="/os-preview"><ArrowLeft size={15} /> Preview home</Link><Link className="os-button" href="/workspace">Explore the current workspace <ExternalLink size={15} /></Link></div>
  </OsPreviewShell>;
}
