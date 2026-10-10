'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, DatabaseZap, LockKeyhole, Search, ShieldAlert } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Overview', detail: 'A single place for the operational state of connected founder-only feeds.' },
  { id: 'run-health', label: 'Run health', detail: 'Future state for task progress and stalled runs.' },
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

export function FounderOperations() {
  const [tab, setTab] = useState<TabId>('overview');
  const [severity, setSeverity] = useState('all');
  const [environment, setEnvironment] = useState('all');
  const [query, setQuery] = useState('');
  const current = TABS.find((item) => item.id === tab) ?? TABS[0];

  return <div className="os-preview" style={{ display: 'block' }}><a className="os-skip" href="#founder-main">Skip to operations</a><header className="os-topbar"><Link className="os-wordmark" href="/os-preview"><span className="os-brand-mark">X</span><span>Xroga OS</span></Link><span className="os-status" style={{ marginLeft: 'auto' }}><LockKeyhole size={12} /> Restricted</span></header><main id="founder-main" className="os-main" style={{ maxWidth: 1420 }}><div className="os-page-heading"><span className="os-eyebrow">Founder Operations · Command 1 shell</span><h1>See what needs attention.</h1><p className="os-lead">This restricted surface is ready for founder-exclusive adapters. Live diagnostics are not connected yet; no operational records are simulated here.</p></div><div className="os-demo-banner" role="status"><ShieldAlert size={18} /> Diagnostics integration pending policy review. Existing admin APIs are not founder-exclusive and are intentionally not called.</div><div className="os-founder-layout"><nav className="os-founder-tabs" aria-label="Operations areas">{TABS.map((item) => <button className={`os-founder-tab ${tab === item.id ? 'is-current' : ''}`} key={item.id} type="button" aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav><div className="os-founder-content"><section className="os-panel" aria-live="polite"><span className="os-eyebrow">{current.label}</span><h2 style={{ marginTop: 12 }}>{current.detail}</h2><p>No live feed is connected for this area. When a founder-exclusive backend adapter is approved, this panel can show sanitized, tenant-scoped records.</p><div className="os-founder-filters"><div className="os-field"><label htmlFor="founder-search">Search sanitized summaries</label><div className="os-search-wrap"><Search size={16} aria-hidden="true" /><input id="founder-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search when connected" /></div></div><div className="os-field"><label htmlFor="founder-severity">Severity</label><select id="founder-severity" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">All severities</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option><option value="critical">Critical</option></select></div><div className="os-field"><label htmlFor="founder-environment">Environment</label><select id="founder-environment" value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="all">All environments</option><option value="production">Production</option><option value="preview">Preview</option></select></div></div><p className="os-small">Filters are ready for a future data adapter; changing them never requests backend data in Command 1.</p><div className="os-table-wrap"><table className="os-table"><thead><tr><th scope="col">Time</th><th scope="col">Severity</th><th scope="col">Environment</th><th scope="col">Sanitized summary</th><th scope="col">Next action</th></tr></thead><tbody><tr><td colSpan={5}><div className="os-empty-state" style={{ border: 0 }}><DatabaseZap size={27} /><h2>Backend connection pending</h2><p>No records are shown. The current admin endpoints permit broader roles, so this founder shell does not fetch them.</p></div></td></tr></tbody></table></div></section><div className="os-actions"><Link className="os-button" href="/os-preview"><ArrowLeft size={15} /> Return to product preview</Link></div></div></div></main></div>;
}
