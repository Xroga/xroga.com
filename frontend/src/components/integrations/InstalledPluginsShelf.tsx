'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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

const INSTALLED_PREVIEW_LIMIT = 12;

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
  const closeTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  function keepOpen(key: string) {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHoveredKey(key);
  }

  function scheduleClose(key: string) {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setHoveredKey((value) => (value === key ? null : value));
      closeTimerRef.current = null;
    }, 140);
  }

  const visiblePlugins = plugins.slice(0, INSTALLED_PREVIEW_LIMIT);
  const remaining = Math.max(0, plugins.length - visiblePlugins.length);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center gap-1.5 self-start rounded-md text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Installed
          </h2>
          {plugins.length ? (
            <span className="rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
              {plugins.length}
            </span>
          ) : null}
          <ChevronRight
            className="h-4 w-4 text-[var(--text-muted)]"
            aria-hidden="true"
          />
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {plugins.length ? (
            <>
              <button
                type="button"
                onClick={onViewAll}
                className="inline-flex min-h-9 items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)]"
              >
                Manage all
              </button>
              <PluginPermissionControl buttonOnly showFullAccessShortcut />
            </>
          ) : null}
        </div>
      </div>

      {plugins.length ? (
        <div className="flex flex-wrap items-start gap-3 pb-2 pt-1">
          {visiblePlugins.map((plugin) => {
            const key = plugin.toolkit || plugin.id;
            const hovered = hoveredKey === key;

            return (
              <div
                key={key}
                className="relative shrink-0"
                onMouseEnter={() => keepOpen(key)}
                onMouseLeave={() => scheduleClose(key)}
                onFocusCapture={() => keepOpen(key)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    scheduleClose(key);
                  }
                }}
              >
                <Link
                  href={detailHref(plugin)}
                  aria-label={`Manage ${plugin.name}`}
                  className="group inline-flex h-[68px] w-[68px] items-center justify-center rounded-[20px] border border-transparent bg-[var(--surface-raised)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-subtle focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] motion-reduce:transform-none"
                >
                  <PluginBrandLogo
                    id={plugin.id}
                    name={plugin.name}
                    toolkit={plugin.toolkit}
                    logo={plugin.logo}
                    fallbackLogo={plugin.logoFallback}
                    size="detail"
                  />
                </Link>

                {hovered ? (
                  <div
                    className="absolute left-0 top-[calc(100%-1px)] z-[90] w-[min(350px,calc(100vw-40px))] rounded-2xl border border-[var(--border-subtle)] bg-[var(--background)] p-4 shadow-[0_26px_70px_rgba(0,0,0,0.28)]"
                    role="group"
                    onMouseEnter={() => keepOpen(key)}
                    onMouseLeave={() => scheduleClose(key)}
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
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                            <Check className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                            {plugin.noAuth ? 'Ready' : 'Connected'}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--text-secondary)]">
                          {plugin.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--border-subtle)] pt-3 text-[10px] text-[var(--text-muted)]">
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

          {remaining > 0 ? (
            <button
              type="button"
              onClick={onViewAll}
              className="inline-flex h-[68px] min-w-[68px] items-center justify-center rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)]"
            >
              +{remaining}
            </button>
          ) : null}
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
    </section>
  );
}
