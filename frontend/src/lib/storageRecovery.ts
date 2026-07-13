const THEME_STORAGE_KEY = 'xroga-theme';
const WORKSPACE_KEY = 'xroga_workspace_session';

/** Clear corrupt persisted state that can brick the client on load */
export function recoverCorruptStorage() {
  if (typeof window === 'undefined') return;

  try {
    const themeRaw = localStorage.getItem(THEME_STORAGE_KEY);
    if (themeRaw) JSON.parse(themeRaw);
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
