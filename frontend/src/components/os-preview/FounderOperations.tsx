'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, DatabaseZap, LockKeyhole, Search, ShieldAlert } from 'lucide-react';
import { FOUNDER_DEMO_FLOW } from '@/lib/osFounderLab';
import { FounderScenarioLab } from './FounderScenarioLab';

const TABS = [
  { id: 'frontier', label: 'Xroga Frontier', detail: 'Private simulated research workflow; no live intelligence feed.' },
  { id: 'scenario-lab', label: 'Scenario & Error Lab', detail: 'Deterministic fixture failures; never production error injection.' },
  { id: 'overview', label: 'Overview', detail: 'A single place for future founder-only operational feeds.' },
  { id: 'run-health', label: 'Run health', detail: 'Future task progress and stalled runs.' },
  { id: 'errors', label: 'Errors', detail: 'Future sanitized error summaries and impact.' },
  { id: 'provider-health', label: 'Provider / worker health', detail: 'Future provider and worker availability with verified timestamps.' },
  { id: 'tool-failures', label: 'Tool failures', detail: 'Future safe failure categories with retry state.' },
  { id: 'approvals', label: 'Approval blocks', detail: 'Future blocked actions awaiting authorized review.' },
  { id: 'cost', label: 'Cost & budget anomalies', detail: 'Future budget exceptions from authenticated records.' },
  { id: 'storage', label: 'Storage durability', detail: 'Future backup and persistence evidence.' },
  { id: 'release', label: 'Release readiness', detail: 'Future release gates backed by actual checks.' },
  { id: 'audit', label: 'Audit timeline', detail: 'Future accountable, redacted action history.' },
] as const;
type TabId = typeof TABS[number]['id'];

function Frontier() {
  const [view, setView] = useState('Opportunity Overview');
  const [window, setWindow] = useState('1–15');
  const [decision, setDecision] = useState('undecided');
  return <section className="os-panel">
    <span className="os-eyebrow">Private interactive example · no live intelligence</span><h2>Xroga Frontier</h2>
    <div className="os-founder-filters"><div className="os-field"><label htmlFor="frontier-area">Research area</label><select id="frontier-area" value={view} onChange={(event) => setView(event.target.value)}>{['Opportunity Overview','GitHub Scout','Technology Radar','User Pain Intelligence','Competitor Watch','Startup Intelligence','Integration Discovery','Rejected Hype','Founder Reports'].map((item) => <option key={item}>{item}</option>)}</select></div><div className="os-field"><label htmlFor="frontier-window">Report window</label><select id="frontier-window" value={window} onChange={(event) => setWindow(event.target.value)}><option>1–15</option><option>16–month end</option></select></div></div>
    <p>Viewing {view} for {window}. All signals below are fictional; no current market claim or repository content is asserted.</p>
    <ol className="os-list">{FOUNDER_DEMO_FLOW.map((step) => <li key={step.id}><strong>{step.title}</strong><small>{step.id === 'decision' ? `${decision}. No implementation or production action follows this selection.` : step.detail}</small></li>)}</ol>
    <div className="os-actions"><button className="os-button os-button-primary" type="button" onClick={() => setDecision('Evaluate in a future sandbox')}>Choose sandbox evaluation</button><button className="os-button" type="button" onClick={() => setDecision('Reject pending license review')}>Reject pending review</button></div>
  </section>;
}

function DisconnectedOperations({ title, detail }: { title: string; detail: string }) {
  const [severity, setSeverity] = useState('all');
  const [environment, setEnvironment] = useState('all');
  const [query, setQuery] = useState('');
  return <section className="os-panel" aria-live="polite">
    <span className="os-eyebrow">{title}</span><h2 style={{ marginTop: 12 }}>{detail}</h2>
    <p>INTEGRATION PENDING. No live feed is connected. A future adapter must be independently founder-exclusive, redacted, tenant-scoped and read-only.</p>
    <div className="os-founder-filters"><div className="os-field"><label htmlFor="founder-search">Search future sanitized summaries</label><div className="os-search-wrap"><Search size={16} aria-hidden="true" /><input id="founder-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search when connected" /></div></div><div className="os-field"><label htmlFor="founder-severity">Severity</label><select id="founder-severity" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">All severities</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option><option value="critical">Critical</option></select></div><div className="os-field"><label htmlFor="founder-environment">Environment</label><select id="founder-environment" value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="all">All environments</option><option value="production">Production</option><option value="preview">Preview</option></select></div></div>
    <p className="os-small">Filters change this empty review state only; they never request backend data. {query || severity !== 'all' || environment !== 'all' ? 'No connected results match because the feed is unavailable.' : ''}</p>
    <div className="os-table-wrap"><table className="os-table"><thead><tr><th scope="col">Time</th><th scope="col">Severity</th><th scope="col">Environment</th><th scope="col">Sanitized summary</th><th scope="col">Next action</th></tr></thead><tbody><tr><td colSpan={5}><div className="os-empty-state" style={{ border: 0 }}><DatabaseZap size={27} /><h2>Backend connection pending</h2><p>No records are shown. Current admin endpoints allow broader roles, so this founder shell does not fetch them.</p></div></td></tr></tbody></table></div>
  </section>;
}

export function FounderOperations() {
  const [tab, setTab] = useState<TabId>('frontier');
  const current = TABS.find((item) => item.id === tab) ?? TABS[0];
  return <div className="os-preview" style={{ display: 'block' }}>
    <a className="os-skip" href="#founder-main">Skip to operations</a>
    <header className="os-topbar"><Link className="os-wordmark" href="/os-preview"><span className="os-brand-mark">X</span><span>Xroga OS</span></Link><span className="os-status" style={{ marginLeft: 'auto' }}><LockKeyhole size={12} /> Restricted</span></header>
    <main id="founder-main" className="os-main" style={{ maxWidth: 1420 }}>
      <div className="os-page-heading"><span className="os-eyebrow">Founder area · server-gated</span><h1>Explore signals. Protect the boundary.</h1><p className="os-lead">Frontier and the Scenario Lab are isolated fictional workflows. Live Operations feeds stay disconnected until founder-exclusive backend policy is proven.</p></div>
      <div className="os-demo-banner" role="status"><ShieldAlert size={18} /> SIMULATED SCENARIO is separate from REAL EVENT. Diagnostics integration pending policy review; existing broader admin APIs are not called.</div>
      <div className="os-founder-layout"><nav className="os-founder-tabs" aria-label="Founder areas">{TABS.map((item) => <button className={`os-founder-tab ${tab === item.id ? 'is-current' : ''}`} key={item.id} type="button" aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav><div className="os-founder-content">{tab === 'frontier' ? <Frontier /> : tab === 'scenario-lab' ? <FounderScenarioLab /> : <DisconnectedOperations key={tab} title={current.label} detail={current.detail} />}<div className="os-actions"><Link className="os-button" href="/os-preview"><ArrowLeft size={15} /> Return to product preview</Link></div></div></div>
    </main>
  </div>;
}
