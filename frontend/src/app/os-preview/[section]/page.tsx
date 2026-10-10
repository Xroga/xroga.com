import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, CircleDashed, LockKeyhole } from 'lucide-react';
import { notFound } from 'next/navigation';
import { OsPreviewShell } from '@/components/os-preview/OsPreviewShell';
import { PREVIEW_DESTINATIONS, previewDestination } from '@/lib/osPreviewNavigation';

export function generateStaticParams() { return PREVIEW_DESTINATIONS.map((item) => ({ section: item.slug })); }

export default async function OsPreviewSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const destination = previewDestination(section);
  if (!destination) notFound();
  const isUpcoming = destination.availability === 'coming-soon';
  return <OsPreviewShell context={destination.label}>
    <div className="os-page-heading"><span className={`os-status os-status--${destination.availability}`}>{destination.availability.replaceAll('-', ' ')}</span><h1>{destination.benefit}</h1><p className="os-lead">{destination.detail}</p></div>
    <div className="os-split">
      <section className="os-panel"><span className="os-eyebrow">{destination.label}</span><h2 style={{ marginTop: 12 }}>{isUpcoming ? 'Designed for the next Xroga OS chapter' : destination.availability === 'interactive-preview' ? 'Explore the simulated coding flow' : 'Use the existing product today'}</h2><p>{isUpcoming ? 'This screen describes the intended experience. It is not connected to a worker, provider, file service or live analytics feed. We will show authorization and evidence before future real actions.' : destination.availability === 'interactive-preview' ? 'The example lets you see the shape of a plan, proposed checks, and a simulated receipt without touching a repository.' : 'The current Xroga product already has this destination. Use the link below to open it; account access still follows existing permissions.'}</p><div className="os-actions">{destination.liveHref ? <Link className="os-button os-button-primary" href={destination.liveHref}>Open current {destination.label.toLowerCase()} <ArrowUpRight size={15} /></Link> : destination.availability === 'interactive-preview' ? <Link className="os-button os-button-primary" href="/os-preview/journey?scenario=code-repair">Try code-repair demo <CircleDashed size={15} /></Link> : <button className="os-button" disabled title="This feature is not connected yet">Not available yet <LockKeyhole size={15} /></button>}<Link className="os-button" href="/os-preview"><ArrowLeft size={15} /> Preview home</Link></div></section>
      <aside className="os-panel"><h2>What to expect</h2><ul className="os-list"><li><strong>Clear scope</strong><small>Know what the system is proposing before any real action.</small></li><li><strong>Permission control</strong><small>Connected services will require an explicit, authorized step.</small></li><li><strong>Inspectable result</strong><small>Real work will need actual evidence rather than a demo receipt.</small></li></ul></aside>
    </div>
    <div className="os-demo-banner" style={{ marginTop: 18 }}><LockKeyhole size={18} /> {isUpcoming ? 'Coming soon — no live operation is available from this screen.' : destination.availability === 'interactive-preview' ? 'Demo experience — no real work or external changes are performed.' : 'This is an overview. The linked existing product follows its own authorization and live behavior.'}</div>
  </OsPreviewShell>;
}
