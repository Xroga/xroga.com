/** Runs before React hydrates — prevents corrupt localStorage from crashing the app */
export function storageBootstrapScript(): string {
  return `(function(){
  try {
    var themeKey = 'xroga-theme';
    var raw = localStorage.getItem(themeKey);
    var core = 'white';
    if (raw) {
      if (raw.length > 120000) {
        localStorage.removeItem(themeKey);
      } else {
        try {
          var parsed = JSON.parse(raw);
          var state = parsed && parsed.state;
          if (state) {
            var dirty = false;
            if (state.customDesktopBg) { delete state.customDesktopBg; dirty = true; }
            if (state.customMobileBg) { delete state.customMobileBg; dirty = true; }
            var t = state.theme;
            if (t === 'black' || t === 'gray' || t === 'white') {
              core = t;
            } else {
              state.theme = 'white';
              state.terminalSkin = 'light';
              state.slideshowEnabled = false;
              dirty = true;
              core = 'white';
            }
            if (state.slideshowEnabled) { state.slideshowEnabled = false; dirty = true; }
            if (dirty) localStorage.setItem(themeKey, JSON.stringify(parsed));
          }
        } catch (e) {
          localStorage.removeItem(themeKey);
        }
      }
    }
    var surfaces = { white: '#ffffff', gray: '#1a1a1a', black: '#000000' };
    document.documentElement.setAttribute('data-theme', core);
    var applyBody = function() {
      if (!document.body) return;
      document.body.classList.remove('theme-image','theme-white','theme-black','theme-gray','xv-deep-work-shell');
      document.body.classList.add('theme-' + core);
      document.body.style.backgroundColor = surfaces[core] || '#ffffff';
      document.body.style.backgroundImage = '';
    };
    if (document.body) applyBody();
    else document.addEventListener('DOMContentLoaded', applyBody);
    var sessionKey = 'xroga_workspace_session';
    var session = localStorage.getItem(sessionKey);
    if (session && session.length > 500000) {
      localStorage.removeItem(sessionKey);
      sessionStorage.removeItem(sessionKey);
    } else if (session) {
      try { JSON.parse(session); } catch (e) {
        localStorage.removeItem(sessionKey);
        sessionStorage.removeItem(sessionKey);
      }
    }
  } catch (e) {}
})();`;
}
