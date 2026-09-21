import Image from 'next/image';
import '@/styles/growth-evidence.css';

export type GrowthVisual = {
  type: 'PRODUCT_SCREENSHOT' | 'WORKFLOW_DIAGRAM';
  src?: string;
  alt: string;
  caption: string;
  verified: string;
};

export function EvidenceFigure({ visual }: { visual: GrowthVisual }) {
  if (visual.type === 'WORKFLOW_DIAGRAM') return <ReleaseEvidenceWorkflow caption={visual.caption} verified={visual.verified} />;
  if (!visual.src) return null;
  return (
    <figure className="xv-growth-figure">
      <Image src={visual.src} alt={visual.alt} width={1600} height={900} sizes="(max-width: 760px) 100vw, 1040px" />
      <figcaption>{visual.caption}<small>Evidence verified {visual.verified}</small></figcaption>
    </figure>
  );
}

export function ReleaseEvidenceWorkflow({ caption, verified }: { caption: string; verified: string }) {
  const stages = [
    ['01', 'Ownership', 'Repository, branch, provider accounts, and named release owner'],
    ['02', 'Product boundaries', 'Authorization, durable data, secrets, migrations, and failure states'],
    ['03', 'Verification', 'Applicable checks, browser journeys, accessibility, and observed blockers'],
    ['04', 'Operations', 'Provider result, monitoring, rollback, recovery, and known limitations'],
  ];
  return (
    <figure className="xv-growth-figure xv-growth-workflow">
      <div role="list" aria-label="Release evidence workflow">
        {stages.map(([number, title, body]) => <article role="listitem" key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}
      </div>
      <figcaption>{caption}<small>Method verified {verified}</small></figcaption>
    </figure>
  );
}

export function DirectAnswer({ children }: { children: React.ReactNode }) {
  return <aside className="xv-direct-answer"><strong>Direct answer</strong><p>{children}</p></aside>;
}

export type ChartPoint = { label: string; value: number; displayValue?: string };

export function AccessibleDataChart({ title, points, source, date }: { title: string; points: ChartPoint[]; source: string; date: string }) {
  if (!points.length) return null;
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <figure className="xv-growth-figure xv-growth-chart">
      <h3>{title}</h3>
      <div aria-hidden="true">{points.map((point) => <span key={point.label}><i style={{ width: `${Math.max(2, (point.value / max) * 100)}%` }} />{point.label}</span>)}</div>
      <table><caption>{title} data</caption><thead><tr><th scope="col">Measure</th><th scope="col">Value</th></tr></thead><tbody>{points.map((point) => <tr key={point.label}><th scope="row">{point.label}</th><td>{point.displayValue ?? point.value}</td></tr>)}</tbody></table>
      <figcaption>Source: {source}<small>Observed {date}</small></figcaption>
    </figure>
  );
}
