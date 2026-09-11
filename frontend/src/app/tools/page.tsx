import { EditorialHub } from '@/components/seo/EditorialPage';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({ title: 'Free Software Planning and Release Tools', description: 'Use transparent, practical Xroga tools for planning and reviewing real software work without invented scores, gated results, or hidden data collection.', path: '/tools' });
export default function Page() { return <EditorialHub path="/tools" title="Small tools for consequential software decisions." description={metadata.description as string} eyebrow="Free tools" intro="Each tool explains its method, works without an account, and distinguishes confirmed evidence from unresolved work." items={[{ href: '/tools/production-readiness-checker', title: 'Production-readiness checker', description: 'Review ownership, security, data, quality, accessibility, runtime, and operational evidence before a release.', meta: 'Interactive · no data stored' }]} />; }
