import { EditorialHub } from '@/components/seo/EditorialPage';
import { COMPARISONS } from '@/lib/seoGrowthContent';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({ title: 'Compare AI App Builders and Coding Agents', description: 'Evidence-based comparisons of Xroga with browser app builders, cloud IDEs, and AI code editors, using current official product documentation.', path: '/compare', keywords: ['AI app builder comparison','AI coding agent comparison'] });

export default function ComparePage(){return <EditorialHub path="/compare" title="Compare AI building workflows—not just feature lists." description={metadata.description as string} eyebrow="Independent decision framework" intro="Different products optimise for different working surfaces: browser creation, cloud development, editor assistance, or repository-centred delivery. These pages identify the practical trade-offs and link to the official sources behind every competitor claim." items={COMPARISONS.map(item=>({href:`/compare/${item.slug}`,title:`Xroga vs ${item.competitor}`,description:item.summary,meta:`Facts reviewed ${item.lastVerified}`}))}/>}
