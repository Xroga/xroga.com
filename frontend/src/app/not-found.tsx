import { RetroTvErrorPage } from '@/components/errors/RetroTvErrorPage';

export default function NotFound() {
  return (
    <RetroTvErrorPage
      screenText="NOT FOUND"
      overlayDigits={['4', '0', '4']}
      title="Page not found"
      description="This page drifted into a black hole. Head back to XROGA AI and keep building."
      backHref="/"
      backLabel="← Back to XROGA AI"
    />
  );
}
