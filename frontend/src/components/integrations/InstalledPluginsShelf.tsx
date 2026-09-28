'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { PluginBrandLogo } from '@/components/integrations/PluginBrandLogo';
import {
  authSummary,
  type RuntimePlugin,
} from '@/lib/pluginCatalog';
import {
  xrogaConnect,
  type XrogaPluginPermissionMode,
} from '@/lib/xrogaConnect';

const PERMISSION_OPTIONS: Array<{
  id: XrogaPluginPermissionMode;
  label: string;
  description: string;
}> = [
  {
    id: 'always_ask',
    label: 'Always ask',
    description:
      'Every state-changing Plugin action asks for confirmation. Read-only access still runs only from an explicit request.',
  },
  {
    id: 'read_only',
    label: 'Allow read-only tools',
    description:
      'Read-only Plugin requests can run directly. Every external change asks for confirmation.',
  },
  {
    id: 'low_risk',
    label: 'Allow low-risk tools',
    description:
      'Read-only and ordinary requested changes can run directly; sensitive or uncertain actions still ask first.',
  },
];

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
  const [permissionMode, setPermissionMode] =
    useState<XrogaPluginPermissionMode>('low_risk');
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    void xrogaConnect.permissionPolicy
      .get()
      .then((result) => {
        if (active) setPermissionMode(result.mode);
      })
      .catch(() => {
        // The server default is low-risk; keep the UI usable if this preference
        // endpoint is briefly unavailable.
      })
      .finally(() => {
        if (active) setPermissionLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const hovered = plugins.find(
    (plugin) => (plugin.toolkit || plugin.id) === hoveredKey,
  );

  async function updatePermission(next: XrogaPluginPermissionMode) {
    if (permissionSaving || next === permissionMode) {
      setMenuOpen(false);
      return;
    }

    const previous = permissionMode;
    setPermissionMode(next);
    setPermissionSaving(true);
    setMenuOpen(false);

    try {
      const result = await xrogaConnect.permissionPolicy.update(next);
      setPermissionMode(result.mode);
      toast.success('Default Plugin permission updated');
    } catch (error) {
      setPermissionMode(previous);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not update Plugin permission',
      );
    } finally {
      setPermissionSaving(false);
    }
  }

  const selected =
    PERMISSION_OPTIONS.find((option) => option.id === permissionMode) ??
    PERMISSION_OPTIONS[2]!;

  return (
    <section className="space-y-3">
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
        <div className="relative">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {plugins.map((plugin) => {
              const key = plugin.toolkit || plugin.id;

              return (
                <Link
                  key={key}
                  href={detailHref(plugin)}
                  aria-label={`Manage ${plugin.name}`}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey((current) => current === key ? null : current)}
                  onFocus={() => setHoveredKey(key)}
                  onBlur={() => setHoveredKey((current) => current === key ? null : current)}
                  className="group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-transparent transition hover:border-[var(--border-subtle)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  <PluginBrandLogo
                    id={plugin.id}
                    name={plugin.name}
                    toolkit={plugin.toolkit}
                    logo={plugin.logo}
                    fallbackLogo={plugin.logoFallback}
                    size="micro"
                  />
                </Link>
              );
            })}
          </div>

          {hovered ? (
            <div
              className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-[min(340px,calc(100vw-48px))] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3.5 shadow-xl"
              role="tooltip"
            >
              <div className="flex items-start gap-3">
                <PluginBrandLogo
                  id={hovered.id}
                  name={hovered.name}
                  toolkit={hovered.toolkit}
                  logo={hovered.logo}
                  fallbackLogo={hovered.logoFallback}
                  size="card"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {hovered.name}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)]">
                      <Check className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                      {hovered.noAuth ? 'Ready' : 'Connected'}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
                    {hovered.description}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3 text-[10px] text-[var(--text-muted)]">
                <span>
                  {hovered.toolsCount !== undefined
                    ? `${hovered.toolsCount.toLocaleString()} actions`
                    : hovered.capabilityCount
                      ? `${hovered.capabilityCount.toLocaleString()} actions`
                      : 'Actions available'}
                </span>
                <span className="text-right">{authSummary(hovered)}</span>
                {hovered.triggersCount ? (
                  <span>{hovered.triggersCount.toLocaleString()} triggers</span>
                ) : (
                  <span>{hovered.category}</span>
                )}
                <span className="text-right font-semibold text-[var(--accent)]">
                  Click to manage
                </span>
              </div>

              <p className="mt-2 text-[10px] leading-4 text-[var(--text-muted)]">
                Manage opens the full app page with live actions, provider scopes, safety classification and account status.
              </p>
            </div>
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

      <div className="relative" ref={menuRef}>
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Default permission
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-secondary)]">
                {selected.description}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={permissionLoading || permissionSaving}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex min-h-9 shrink-0 items-center justify-between gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] disabled:opacity-55"
          >
            {permissionLoading || permissionSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            <span>{selected.label}</span>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {menuOpen ? (
          <div
            role="menu"
            aria-label="Default Plugin permission"
            className="absolute right-0 z-40 mt-2 w-[min(360px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1.5 shadow-xl"
          >
            {PERMISSION_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={permissionMode === option.id}
                onClick={() => void updatePermission(option.id)}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--surface-inset)]"
              >
                <span className="min-w-0 flex-1">
                  <strong className="block text-xs font-semibold text-[var(--text-primary)]">
                    {option.label}
                  </strong>
                  <span className="mt-0.5 block text-[11px] leading-4 text-[var(--text-secondary)]">
                    {option.description}
                  </span>
                </span>
                {permissionMode === option.id ? (
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-primary)]"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-[10px] leading-4 text-[var(--text-muted)]">
        This setting controls Xroga’s default approval behavior. Provider OAuth scopes remain controlled by each app and are listed on that app’s Manage page.
      </p>
    </section>
  );
}
