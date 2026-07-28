import { ReferralRedirectClient } from '@/components/referrals/ReferralRedirectClient';

export default async function RefLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode ?? '').trim().toUpperCase();
  return <ReferralRedirectClient code={code} />;
}
