const THEME_STORAGE_KEY = 'xroga-theme';
const WORKSPACE_KEY = 'xroga_workspace_session';
const MAX_THEME_JSON_BYTES = 120_000;

/** Clear corrupt persisted state that can brick the client on load */
export function recoverCorruptStorage() {
  if (typeof window === 'undefined') return;

  try {
    const themeRaw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!themeRaw) return;

    if (themeRaw.length > MAX_THEME_JSON_BYTES) {
      localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }

    const parsed = JSON.parse(themeRaw) as { state?: Record<string, unknown> };
    const state = parsed?.state;
    if (state && (typeof state.customDesktopBg === 'string' || typeof state.customMobileBg === 'string')) {
      delete state.customDesktopBg;
      delete state.customMobileBg;
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ ...parsed, state }));
    }
  } catch {
    localStorage.removeItem(THEME_STORAGE_KEY);
  }

  try {
    const sessionRaw = localStorage.getItem(WORKSPACE_KEY);
    if (sessionRaw) JSON.parse(sessionRaw);
  } catch {
    localStorage.removeItem(WORKSPACE_KEY);
    sessionStorage.removeItem(WORKSPACE_KEY);
  }
}

export function resetClientGlitchState() {
  if (typeof window === 'undefined') return;
  recoverCorruptStorage();
  localStorage.removeItem(WORKSPACE_KEY);
  sessionStorage.removeItem(WORKSPACE_KEY);
}
