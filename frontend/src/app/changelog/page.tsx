import Link from 'next/link';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { CHANGELOG_ENTRIES } from '@/lib/seoExpansionContent';
import { buildMetadata } from '@/lib/seo';
import '@/styles/seo-editorial.css';

const title = 'Xroga product changelog';
const description = 'A factual record of meaningful Xroga product and reliability changes, with dates, validation context, and commit references where available.';
export const metadata = buildMetadata({ title, description, path: '/changelog' });
export default function Page() { return <main className="xv-seo-page"><PageJsonLd path="/changelog" name={title} description={description} /><div className="xv-seo-shell"><nav className="xv-seo-crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span><i>/</i><Link href="/changelog">Changelog</Link></span></nav><header className="xv-seo-hero"><p className="xv-seo-eyebrow">Product record</p><h1>{title}</h1><p className="xv-seo-dek">Meaningful changes, described without turning routine edits into invented launch claims.</p></header><div className="xv-changelog">{CHANGELOG_ENTRIES.map((entry) => <article key={`${entry.date}-${entry.title}`}><time dateTime={entry.date}>{entry.date}</time><div><h2>{entry.title}</h2><ul>{entry.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>{entry.commits.length > 0 ? <p>Repository references: {entry.commits.map((commit, index) => <span key={commit}>{index > 0 ? ', ' : ''}<a href={`https://github.com/Xroga/xroga.com/commit/${commit}`}>{commit}</a></span>)}</p> : null}</div></article>)}</div></div></main>; }
