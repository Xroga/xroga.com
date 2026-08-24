'use client';

import { Check } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { ACCENT_OPTIONS, FONT_CHOICES, THEME_OPTIONS, THEME_SURFACE, normalizeTheme, skinForTheme, type CoreThemeId } from '@/lib/theme';
import { Switch } from '@/components/ui/Switch';
import { Select } from '@/components/ui/Select';
import { SettingsDivider, SettingsPanelHeader, SettingsStack } from '@/components/settings/SettingsPrimitives';
import { cn } from '@/lib/utils';

export function ThemeSettingsPanel() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setTerminalSkin = useThemeStore((s) => s.setTerminalSkin);
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
        description="Choose a surface, accent, type style, density, and accessibility preferences. Changes preview immediately."
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
                  setTerminalSkin(skinForTheme(id));
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
