/** Runs before React hydrates — prevents corrupt localStorage from crashing the app */
export function storageBootstrapScript(): string {
  return `(function(){
  try {
    var themeKey = 'xroga-theme';
    var raw = localStorage.getItem(themeKey);
    if (raw) {
      if (raw.length > 120000) {
        localStorage.removeItem(themeKey);
      } else {
        try {
          var parsed = JSON.parse(raw);
          var state = parsed && parsed.state;
          if (state && (state.customDesktopBg || state.customMobileBg)) {
            delete state.customDesktopBg;
            delete state.customMobileBg;
            localStorage.setItem(themeKey, JSON.stringify(parsed));
          }
        } catch (e) {
          localStorage.removeItem(themeKey);
        }
      }
    }
    var sessionKey = 'xroga_workspace_session';
    var session = localStorage.getItem(sessionKey);
    if (session) {
      try { JSON.parse(session); } catch (e) {
        localStorage.removeItem(sessionKey);
        sessionStorage.removeItem(sessionKey);
      }
    }
  } catch (e) {}
})();`;
}
