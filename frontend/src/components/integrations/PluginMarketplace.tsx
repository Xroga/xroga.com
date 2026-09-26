'use client';

import Link from 'next/link';
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  xrogaConnect,
  type XrogaConnectToolkit,
} from '@/lib/xrogaConnect';
import {
  clearOAuthResult,
  subscribeOAuthResults,
} from '@/lib/oauthPopupResult';
import {
  filterPluginsByCategory,
  mergePlugins,
  PLUGIN_CATEGORIES,
  PLUGIN_SEED,
  pluginMatchesToolkit,
  pluginsFromSearch,
  rankPlugins,
  type MarketplacePlugin,
  type PluginCategory,
} from '@/lib/pluginMarketplace';

import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { ConnectedServicesSection } from '@/components/integrations/ConnectedServicesSection';
import { CustomCredentialsSection } from '@/components/integrations/CustomCredentialsSection';

type MarketplaceView =
  | 'discover'
  | 'connected'
  | 'developer'
  | 'custom';

const VIEWS: Array<{
  id: MarketplaceView;
  label: string;
}> = [
  { id: 'discover', label: 'Discover' },
  { id: 'connected', label: 'Connected' },
  { id: 'developer', label: 'Developer' },
  { id: 'custom', label: 'Custom' },
];

const INITIAL_VISIBLE = 30;

function isMarketplaceView(value: string | null): value is MarketplaceView {
  return VIEWS.some((item) => item.id === value);
}

function PluginStatus({
  plugin,
  checking,
}: {
  plugin: MarketplacePlugin;
  checking?: boolean;
}) {
  if (checking) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Checking
      </span>
    );
  }

  if (plugin.connected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Connected
      </span>
    );
  }

  if (plugin.availability === 'unavailable') {
    return (
      <span className="text-xs font-medium text-[var(--text-muted)]">
        Unavailable
      </span>
    );
  }

  if (plugin.availability === 'coming_soon') {
    return (
      <span className="text-xs font-medium text-[var(--text-muted)]">
        Coming soon
      </span>
    );
  }

  return (
    <span className="text-xs font-medium text-[var(--text-muted)]">
      Available
    </span>
  );
}

function PluginCard({
  plugin,
  connecting,
  checking,
  onConnect,
  onPreview,
}: {
  plugin: MarketplacePlugin;
  connecting: boolean;
  checking?: boolean;
  onConnect: (plugin: MarketplacePlugin) => void;
  onPreview: (plugin: MarketplacePlugin) => void;
}) {
  const disabled =
    connecting ||
    plugin.availability !== 'available' ||
    !plugin.connectable;

  const buttonLabel =
    plugin.source === 'credential'
      ? 'Configure'
      : plugin.connected
        ? 'Manage'
        : 'Connect';

  return (
    <article className="group flex min-h-[112px] flex-col rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 sm:min-h-[142px] sm:p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-subtle motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onPreview(plugin)}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-token-sm text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          aria-label={`View ${plugin.name} plugin`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white p-1.5 text-black shadow-subtle">
            <IntegrationLogo
              id={plugin.id}
              name={plugin.name}
              size={26}
              src={plugin.logo}
              className="max-h-full max-w-full object-contain"
            />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {plugin.name}
              </span>
              {plugin.connected ? (
                <span className="sr-only">Connected</span>
              ) : null}
            </span>

            <span className="mt-1 block line-clamp-2 text-[13px] leading-5 text-[var(--text-secondary)]">
              {plugin.description}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onConnect(plugin)}
          disabled={disabled}
          className={cn(
            'shrink-0 rounded-token-sm border px-2.5 py-1.5 text-xs font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50',
            plugin.connected
              ? 'border-[var(--border-subtle)] bg-[var(--surface-inset)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
              : 'border-[var(--accent)]/35 bg-[var(--accent)]/10 text-[var(--text-primary)] hover:bg-[var(--accent)]/15',
          )}
          aria-label={`${buttonLabel} ${plugin.name}`}
        >
          {connecting ? 'Connecting…' : buttonLabel}
        </button>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-[var(--text-muted)]">
            {plugin.category}
            {plugin.capabilityCount
              ? ` · ${plugin.capabilityCount} capabilities`
              : ''}
          </p>
          {plugin.statusMessage && plugin.connected ? (
            <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
              {plugin.statusMessage}
            </p>
          ) : null}
        </div>

        <PluginStatus plugin={plugin} checking={checking} />
      </div>
    </article>
  );
}

function PluginGrid({
  plugins,
  connectingId,
  checkingNative,
  onConnect,
  onPreview,
}: {
  plugins: readonly MarketplacePlugin[];
  connectingId: string | null;
  checkingNative: boolean;
  onConnect: (plugin: MarketplacePlugin) => void;
  onPreview: (plugin: MarketplacePlugin) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {plugins.map((plugin) => (
        <PluginCard
          key={plugin.id}
          plugin={plugin}
          connecting={connectingId === plugin.id}
          checking={checkingNative && plugin.source === 'native'}
          onConnect={onConnect}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
}

function SectionHeading({
  title,
  meta,
}: {
  title: string;
  meta?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      {meta ? (
        <span className="text-xs text-[var(--text-muted)]">{meta}</span>
      ) : null}
    </div>
  );
}

function Marke