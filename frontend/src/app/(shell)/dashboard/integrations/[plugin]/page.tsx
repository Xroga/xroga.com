import { PluginDetail } from '@/components/integrations/PluginDetail';

export default async function PluginDetailPage({
  params,
}: {
  params: Promise<{ plugin: string }>;
}) {
  const { plugin } = await params;

  return <PluginDetail pluginId={decodeURIComponent(plugin)} />;
}
