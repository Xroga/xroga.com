'use client';

import { Check } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { ACCENT_OPTIONS, FONT_CHOICES, TERMINAL_SKINS, THEME_OPTIONS, THEME_SURFACE, normalizeTheme, type CoreThemeId } from '@/lib/theme';
import { Switch } from '@/components/ui/Switch';
import { Select } from '@/components/ui/Select';
import { SettingsDivider, SettingsPanelHeader, SettingsStack } from '@/components/settings/SettingsPrimitives';
import { cn } from '@/lib/utils';

export function ThemeSettingsPanel() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const terminalSkin = useThemeStore((s) => s.terminalSkin);
  const terminalSkinAuto = useThemeStore((s) => s.terminalSkinAuto);
  const setTerminalSkin = useThemeStore((s) => s.setTerminalSkin);
  const setTerminalSkinAuto = useThemeStore((s) => s.setTerminalSkinAuto);
  const accent = useThemeStore((s) => s.accent);
  const setAccent = useThemeStore((s) => s.setAccent);
  const fontPreference = useThemeStore((s) => s.fontPreference);
  const setFontPreference = useThemeStore((s) => s.setFontPreference);
  const sidebarFont = useThemeStore((s) => s.sidebarFont);
  const setSidebarFont = useThemeStore((s) => s.setSidebarFont);
  const workspaceFont = useThemeStore((s) => s.workspaceFont);
  const setWorkspaceFont = useThemeStore((s) => s.setWorkspaceFont);
  const density = useThemeStore((s) => s.density);
  const setDensity = useThemeStore((s) => s.setDensity);
  const reducedMotion = useThemeStore((s) => s.reducedMotion);
  const setReducedMotion = useThemeStore((s) => s.setReducedMotion);
  const highContrast = useThemeStore((s) => s.highContrast);
  const setHighContrast = useThemeStore((s) => s.setHighContrast);
  const currentTheme = normalizeTheme(theme);

  return (
    <SettingsStack>
      <SettingsPanelHeader
        title="Theme"
        description="Choose the workspace surface first, then tune the terminal and interface around it. Every change previews immediately."
      />

      <div>
        <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Surface</p>
        <div
          role="radiogroup"
          aria-label="Theme surface"
          className="grid gap-3 sm:grid-cols-4"
        >
          {THEME_OPTIONS.map((opt) => {
            const active = currentTheme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  const id = opt.id as CoreThemeId;
                  setTheme(id);
                }}
                className={cn(
                  'rounded-token-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                    : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]',
                )}
              >
                <span
                  className="mb-2 flex h-10 w-full items-center justify-end rounded-token-sm border border-[var(--border-subtle)] p-1"
                  style={{ backgroundColor: THEME_SURFACE[opt.id] }}
                  aria-hidden="true"
                >
                  {active && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </span>
                <p className="text-sm font-medium text-[var(--text-primary)]">{opt.label}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <SettingsDivider label="Terminal skin" />

      <div>
        <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">Console colors</p>
        <p className="mb-3 text-xs text-[var(--text-muted)]">Match the workspace automatically or choose a dedicated palette for every terminal.</p>
        <div role="radiogroup" aria-label="Terminal skin" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            role="radio"
            aria-checked={terminalSkinAuto}
            onClick={setTerminalSkinAuto}
            className={cn(
              'flex min-h-14 items-center gap-3 rounded-token-md border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
              terminalSkinAuto
                ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]',
            )}
          >
            <span
              aria-hidden="true"
              className="grid h-9 w-12 shrink-0 grid-cols-2 overflow-hidden rounded-token-sm border border-[var(--border-subtle)]"
            >
              <i className="bg-white" />
              <i className="bg-black" />
            </span>
            <span className="min-w-0">
              <strong className="block text-xs text-[var(--text-primary)]">Match theme</strong>
              <small className="block text-[10px] text-[var(--text-muted)]">Updates with the surface</small>
            </span>
            {terminalSkinAuto && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />}
          </button>

          {TERMINAL_SKINS.map((spec) => {
            const active = !terminalSkinAuto && terminalSkin === spec.id;
            return (
              <button
                key={spec.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTerminalSkin(spec.id)}
                className={cn(
                  'flex min-h-14 items-center gap-3 rounded-token-md border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                    : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]',
                )}
              >
                <span
                  aria-hidden="true"
                  className="relative h-9 w-12 shrink-0 overflow-hidden rounded-token-sm border"
                  style={{ background: spec.swatch[0], borderColor: spec.swatch[2] }}
                >
                  <i className="absolute bottom-2 left-2 h-1 w-5 rounded-full" style={{ background: spec.swatch[1] }} />
                  <i className="absolute bottom-2 right-2 h-1 w-1 rounded-full" style={{ background: spec.swatch[2] }} />
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-xs text-[var(--text-primary)]">{spec.label}</strong>
                  <small className="block text-[10px] capitalize text-[var(--text-muted)]">{spec.tone} terminal</small>
                </span>
                {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Accent</p>
        <div role="radiogroup" aria-label="Accent color" className="flex flex-wrap gap-2">
          {ACCENT_OPTIONS.map((opt) => {
            const active = accent === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={opt.label}
                onClick={() => setAccent(opt.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  active ? 'border-[var(--border-strong)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]',
                )}
              >
                {/* Default's swatch is `currentColor`, so it paints the theme ink and
                    inverts with the theme rather than showing a hex that would be
                    wrong on three themes out of four. Its tick has to invert with it,
                    which a fixed white one would not. */}
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ backgroundColor: opt.swatch, color: 'var(--foreground)' }}
                  aria-hidden="true"
                >
                  {active && (
                    <Check
                      className="h-3 w-3"
                      style={{ color: opt.id === 'default' ? 'var(--background)' : '#ffffff' }}
                    />
                  )}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <SettingsDivider />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Shell font" value={fontPreference} onChange={(e) => setFontPreference(e.target.value as typeof fontPreference)}>
          <option value="modern">Modern</option>
          <option value="classic">Classic</option>
          <option value="mono">Monospace</option>
        </Select>
        <Select label="Density" value={density} onChange={(e) => setDensity(e.target.value as typeof density)}>
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </Select>
      </div>

      <SettingsDivider />

      {/* Two surfaces, two choices. They were one setting for the whole shell, which
          is the wrong grain: the sidebar is a list of labels and the workspace is a
          working surface, and the face that suits one need not suit the other.
          `Default` leaves a surface on whatever the shell is already using. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Sidebar font"
          value={sidebarFont}
          onChange={(e) => setSidebarFont(e.target.value as typeof sidebarFont)}
        >
          {FONT_CHOICES.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label} — {choice.hint}
            </option>
          ))}
        </Select>
        <Select
          label="Workspace font"
          value={workspaceFont}
          onChange={(e) => setWorkspaceFont(e.target.value as typeof workspaceFont)}
        >
          {FONT_CHOICES.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label} — {choice.hint}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Switch checked={reducedMotion} onChange={setReducedMotion} label="Reduce motion" description="Turns off animation and transition effects app-wide." />
        <Switch checked={highContrast} onChange={setHighContrast} label="High contrast" description="Strengthens borders and text contrast for low-vision accessibility." />
      </div>
    </SettingsStack>
  );
}
