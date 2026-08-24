import { SoftwareLanding } from '@/components/marketing/SoftwareLanding';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Build Software with AI — Xroga',
  description:
    'Plan, build, test and prepare deployable software from a product outcome, with the code in your repository and provider ownership in your accounts.',
  path: '/software',
  keywords: [
    'build software with AI',
    'AI software builder',
    'AI software development',
    'AI product builder',
    'Xroga software',
  ],
});

export default function Page() {
  return <SoftwareLanding />;
}
