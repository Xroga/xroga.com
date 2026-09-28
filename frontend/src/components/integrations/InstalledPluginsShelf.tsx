'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Flame,
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
  highTrust?: boolean;
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
  {
    id: 'full_access',
    label: 'Full access',
    description:
      'Every Plugin action you explicitly request can run without an extra confirmation, including sensitive or destructive actions. Provider OAuth scopes still apply.',
    highTrust: true,
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
        // The server default is low-risk; keep the shelf usable if this
        // preference endpoint is temporarily unavailable.
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
        <div className="flex items-start gap-3 overflow-x-auto overflow-y-visible pb-3 pt-1 scrollbar-hide">
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
                    className="absolute left-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-48px))] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-xl"
                    role="tooltip"
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

      <div className="relative" ref={menuRef}>
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Default permission
                </p>
                {selected.highTrust ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/35 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                    <Flame className="h-3 w-3" aria-hidden="true" />
                    High trust
                  </span>
                ) : null}
              </div>
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
            className={
              selected.highTrust
                ? 'inline-flex min-h-9 shrink-0 items-center justify-between gap-2 rounded-full border border-orange-500/40 bg-orange-500/10 px-3 text-xs font-semibold text-orange-600 transition hover:bg-orange-500/15 disabled:opacity-55'
                : 'inline-flex min-h-9 shrink-0 items-center justify-between gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] disabled:opacity-55'
            }
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
            className="absolute right-0 z-50 mt-2 w-[min(390px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1.5 shadow-xl"
          >
            {PERMISSION_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={permissionMode === option.id}
                onClick={() => void updatePermission(option.id)}
                className={
                  option.highTrust
                    ? 'flex w-full items-start gap-3 rounded-xl border border-orange-500/15 bg-orange-500/5 px-3 py-2.5 text-left transition hover:bg-orange-500/10'
                    : 'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--surface-inset)]'
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="block text-xs font-semibold text-[var(--text-primary)]">
                      {option.label}
                    </strong>
                    {option.highTrust ? (
                      <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-600">
                        Full access
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-[var(--text-secondary)]">
                    {option.description}
                  </span>
                </span>
                {permissionMode === option.id ? (
                  <Check
                    className={
                      option.highTrust
                        ? 'mt-0.5 h-4 w-4 shrink-0 text-orange-600'
                        : 'mt-0.5 h-4 w-4 shrink-0 text-[var(--text-primary)]'
                    }
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-[10px] leading-4 text-[var(--text-muted)]">
        This setting controls Xroga’s default approval behavior. Full access removes extra confirmation checkpoints only for actions you explicitly ask Xroga to perform; provider OAuth scopes and account permissions still apply.
      </p>
    </section>
  );
}
