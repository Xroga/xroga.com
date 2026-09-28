'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Flame,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

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
      'Every Plugin action you explicitly request can run without an extra Xroga confirmation, including sensitive or destructive actions. Provider OAuth scopes, account permissions, and platform-enforced safeguards still apply.',
    highTrust: true,
  },
];

export function PluginPermissionControl({
  compact = false,
  buttonOnly = false,
  showFullAccessShortcut = false,
}: {
  compact?: boolean;
  buttonOnly?: boolean;
  showFullAccessShortcut?: boolean;
}) {
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
      .catch(() => undefined)
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

  const menu = menuOpen ? (
    <div
      role="menu"
      aria-label="Default Plugin permission"
      className="absolute right-0 z-[80] mt-2 w-[min(390px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--background)] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.24)]"
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
                <span className="rounded-full border border-orange-500/25 bg-orange-500/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-600">
                  High trust
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
  ) : null;

  if (buttonOnly) {
    return (
      <div className="relative inline-flex" ref={menuRef}>
        <button
          type="button"
          disabled={permissionLoading || permissionSaving}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className={
            selected.highTrust
              ? 'inline-flex min-h-9 items-center gap-2 rounded-full border border-orange-500/45 bg-orange-500/12 px-3 text-xs font-semibold text-orange-600 transition hover:bg-orange-500/18 disabled:opacity-55'
              : 'inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)] disabled:opacity-55'
          }
        >
          {permissionLoading || permissionSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : selected.highTrust ? (
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
          )}
          <span>{selected.highTrust ? 'Full access' : 'Permissions'}</span>
          {!selected.highTrust && showFullAccessShortcut ? (
            <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-600">
              Full access
            </span>
          ) : null}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <div
        className={
          compact
            ? 'flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between'
            : 'flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between'
        }
      >
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
            <p className="mt-0.5 max-w-3xl text-[11px] leading-4 text-[var(--text-secondary)]">
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

      {menu}

      {!compact ? (
        <p className="mt-2 text-[10px] leading-4 text-[var(--text-muted)]">
          Full access removes extra Xroga confirmation checkpoints only for actions you explicitly ask Xroga to perform; provider OAuth scopes, account permissions, and platform safeguards still apply.
        </p>
      ) : null}
    </div>
  );
}
