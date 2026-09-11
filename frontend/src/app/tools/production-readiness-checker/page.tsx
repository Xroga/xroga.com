import Link from 'next/link';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { ProductionReadinessChecker } from '@/components/seo/ProductionReadinessChecker';
import { buildMetadata } from '@/lib/seo';
import '@/styles/seo-editorial.css';

const title = 'Free production-readiness checker for software teams';
const description = 'Review concrete release evidence across ownership, security, data, quality, accessibility, runtime, and operations with a transparent free checklist.';
export const metadata = buildMetadata({ title, description, path: '/tools/production-readiness-checker' });

export default function Page() {
  return <main className="xv-seo-page"><PageJsonLd path="/tools/production-readiness-checker" name={title} description={description} /><div className="xv-seo-shell"><nav className="xv-seo-crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span><i>/</i><Link href="/tools">Tools</Link></span><span><i>/</i><Link href="/tools/production-readiness-checker">Production readiness</Link></span></nav><header className="xv-seo-hero"><p className="xv-seo-eyebrow">Free release tool</p><h1>{title}</h1><p className="xv-seo-dek">A production claim needs evidence from the complete system. Use this checklist to expose missing proof before a consequential release.</p></header><ProductionReadinessChecker /><article className="xv-seo-tool-method"><section><p className="xv-seo-section-number">01</p><h2>Methodology</h2><p>The checklist covers eight boundaries that commonly separate a successful build from a reliable release. It counts confirmed and unresolved statements; it does not weight them or manufacture a percentage score.</p></section><section><p className="xv-seo-section-number">02</p><h2>How to use the result</h2><p>Attach evidence to each confirmed item: a commit, test run, provider response, accessibility review, operating procedure, or named owner. An unresolved item should receive an owner and a decision before launch.</p></section><section><p className="xv-seo-section-number">03</p><h2>Limits</h2><p>This client-side checklist does not inspect your repository, infrastructure, data, or provider accounts. It stores no response and cannot certify security, compliance, availability, or business readiness.</p></section></article></div></main>;
}
