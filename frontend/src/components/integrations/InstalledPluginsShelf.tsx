'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Check,
  ChevronRight,
} from 'lucide-react';

import { PluginBrandLogo } from '@/components/integrations/PluginBrandLogo';
import {
  authSummary,
  type RuntimePlugin,
} from '@/lib/pluginCatalog';
import { PluginPermissionControl } from '@/components/integrations/PluginPermissionControl';

function detailHref(plugin: RuntimePlugin): string {
  return `/dashboard/integrations/${encodeURIComponent(plugin.toolkit || plugin.id)}`;
}

export function InstalledPluginsShelf({
  plugins,
  onViewAll,
}: {
  plugins: RuntimePlugin[];
  onViewAll: () => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center gap-1 rounded-md text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Installed
          </h2>
          <ChevronRight
            className="h-4 w-4 text-[var(--text-muted)]"
            aria-hidden="true"
          />
        </button>

        {plugins.length ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            Manage all
          </button>
        ) : null}
      </div>

      {plugins.length ? (
        <div className="flex flex-wrap items-start gap-3 pb-3 pt-1">
          {plugins.map((plugin) => {
            const key = plugin.toolkit || plugin.id;
            const hovered = hoveredKey === key;

            return (
              <div
                key={key}
                className="relative shrink-0"
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() =>
                  setHoveredKey((value) => (value === key ? null : value))
                }
                onFocusCapture={() => setHoveredKey(key)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setHoveredKey((value) => (value === key ? null : value));
                  }
                }}
              >
                <Link
                  href={detailHref(plugin)}
                  aria-label={`Manage ${plugin.name}`}
                  className="group inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-transparent bg-[var(--surface-raised)] transition hover:-translate-y-0.5 hover:border-[var(--border-subtle)] hover:shadow-subtle focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] motion-reduce:transform-none"
                >
                  <PluginBrandLogo
                    id={plugin.id}
                    name={plugin.name}
                    toolkit={plugin.toolkit}
                    logo={plugin.logo}
                    fallbackLogo={plugin.logoFallback}
                    size="card"
                  />
                </Link>

                {hovered ? (
                  <div
                    className="absolute left-0 top-[calc(100%-2px)] z-50 w-[min(360px,calc(100vw-48px))] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-xl"
                    role="group"
                  >
                    <div className="flex items-start gap-3">
                      <PluginBrandLogo
                        id={plugin.id}
                        name={plugin.name}
                        toolkit={plugin.toolkit}
                        logo={plugin.logo}
                        fallbackLogo={plugin.logoFallback}
                        size="detail"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {plugin.name}
                          </p>
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                            <Check className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                            {plugin.noAuth ? 'Ready' : 'Connected'}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--text-secondary)]">
                          {plugin.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3 text-[10px] text-[var(--text-muted)]">
                      <span>
                        {plugin.toolsCount !== undefined
                          ? `${plugin.toolsCount.toLocaleString()} actions`
                          : plugin.capabilityCount
                            ? `${plugin.capabilityCount.toLocaleString()} actions`
                            : 'Actions available'}
                      </span>
                      <span className="text-right">{authSummary(plugin)}</span>
                      {plugin.triggersCount ? (
                        <span>{plugin.triggersCount.toLocaleString()} triggers</span>
                      ) : (
                        <span>{plugin.category}</span>
                      )}
                      <Link
                        href={detailHref(plugin)}
                        className="text-right font-semibold text-[var(--accent)] hover:underline"
                      >
                        Manage Plugin
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-token-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-inset)]/45 px-4 py-4">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            No Plugins installed yet.
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            Connect an app below and it will appear here.
          </p>
        </div>
      )}

      <PluginPermissionControl compact />
    </section>
  );
}