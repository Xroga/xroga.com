import { PluginDetail } from '@/components/integrations/PluginDetail';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';

export default async function PluginDetailPage({
  params,
}: {
  params: Promise<{ plugin: string }>;
}) {
  const { plugin } = await params;

  return (
    <PageFullscreenFrame showToggle={false}>
      <PluginDetail pluginId={decodeURIComponent(plugin)} />
    </PageFullscreenFrame>
  );
}
