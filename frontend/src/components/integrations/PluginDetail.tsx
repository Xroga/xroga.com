'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { api } from '@/lib/api';
import {
  canonicalPluginId,
  genericPluginDefinition,
  groupCapabilities,
  inferCategory,
  pluginDefinitionFor,
  type ConnectionState,
  type NativePluginId,
  type PluginCapability,
  type PluginDefinition,
  type PluginCapabilityGroup,
} from '@/lib/pluginCatalog';
import {
  clearOAuthResult,
  subscribeOAuthResults,
} from '@/lib/oauthPopupResult';
import {
  xrogaConnect,
  type XrogaConnectToolkit,
  type XrogaConnectTool,
} from '@/lib/xrogaConnect';
import { useAppStore } from '@/store/useAppStore';

type NativeSnapshot = {
  state: ConnectionState;
  accountLabel?: string;
  statusMessage?: string;
};

function riskLabel(capability: PluginCapability) {
  if (capability.requiresConfirmation) return 'Confirmation';
  if (capability.risk === 'destructive') return 'Sensitive';
  if (capability.risk === 'write') return 'Write';
  if (capability.risk === 'read') return 'Read';
  return 'Action';
}

function RiskBadge({ capability }: { capability: PluginCapability }) {
  const label = riskLabel(capability);
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
      {label}
    </span>
  );
}

function DetailLogo({
  definition,
  toolkit,
}: {
  definition: PluginDefinition;
  toolkit: XrogaConnectToolkit | null;
}) {
  const [failed, setFailed] = useState(false);

  if (toolkit?.logo && !failed) {
    return (
      <img
        src={toolkit.logo}
        alt=""
        className="h-14 w-14 rounded-2xl border border-[var(--border-subtle)] bg-white object-contain p-2"