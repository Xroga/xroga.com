'use client';

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

const PALETTE_TOKENS = [
  '--foreground', '--muted', '--accent', '--accent-dim',
  '--terminal-ui-surface', '--terminal-ui-raised', '--terminal-ui-inset', '--terminal-ui-border',
  '--background', '--card', '--card-border', '--app-panel',
  '--surface-base', '--surface-raised', '--surface-inset', '--border-subtle',
  '--text-primary', '--text-secondary', '--text-muted', '--menu-surface', '--menu-border',
] as const;

/** Body portals keep the palette of their actual workspace, independently of the page theme. */
export function useTerminalPopoverPalette(open: boolean, anchorRef: RefObject<HTMLElement | null>): CSSProperties {
  const [palette, setPalette] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    const scope = anchorRef.current?.closest<HTMLElement>('[class*="terminal-skin-"]');
    if (!scope) { setPalette({}); return; }
    const sync = () => {
      const computed = getComputedStyle(scope);
      const values: Record<string, string> = {};
      for (const token of PALETTE_TOKENS) {
        const value = computed.getPropertyValue(token).trim();
        if (value) values[token] = value;
      }
      values['--xv-popup-surface'] = computed.getPropertyValue('--terminal-ui-raised').trim();
      values['--xv-popup-raised'] = computed.getPropertyValue('--terminal-ui-inset').trim();
      values['--xv-popup-ink'] = computed.getPropertyValue('--foreground').trim();
      values['--xv-popup-muted'] = computed.getPropertyValue('--muted').trim();
      values['--xv-popup-border'] = computed.getPropertyValue('--terminal-ui-border').trim();
      setPalette(values as CSSProperties);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(scope, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, [open, anchorRef]);
  return palette;
}
