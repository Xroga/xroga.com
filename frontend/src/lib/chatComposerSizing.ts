/** Maximum auto-grown composer height for the current usable viewport. */
export function composerMaxHeightForViewport(width: number, height: number): number {
  if (width < 640) return Math.max(160, Math.min(300, height * 0.38));
  if (width < 1024) return Math.max(220, Math.min(380, height * 0.44));
  return Math.max(280, Math.min(480, height * 0.52));
}
