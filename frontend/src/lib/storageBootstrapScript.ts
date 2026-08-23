/** Runs before React hydrates — prevents corrupt localStorage from crashing the app */
export function storageBootstrapScript(): string {
  return `(function(){
  try {
    var themeKey = 'xroga-theme';
    var raw = localStorage.getItem(themeKey);
    var core = 'white';
    var accent = 'blue';
    var sidebarFont = 'default';
    var workspaceFont = 'default';
    var font = 'modern';
    var density = 'comfortable';
    var reducedMotion = false;
    var highContrast = false;
    var sidebarOpen = true;
    var sidebarWidth = 256;
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
            if (t === 'black' || t === 'gray' || t === 'white' || t === 'beige') {
              core = t;
            } else {
              state.theme = 'white';
              state.terminalSkin = 'light';
              state.slideshowEnabled = false;
              dirty = true;
              core = 'white';
            }
            if (/^(default|blue|emerald|violet|coral|amber|cyan|rose)$/.test(state.accent || '')) accent = state.accent;
            if (/^(modern|classic|mono)$/.test(state.fontPreference || '')) font = state.fontPreference;
            if (/^(default|inter|goga|serif|display|mono)$/.test(state.sidebarFont || '')) sidebarFont = state.sidebarFont;
            if (/^(default|inter|goga|serif|display|mono)$/.test(state.workspaceFont || '')) workspaceFont = state.workspaceFont;
            if (/^(compact|comfortable)$/.test(state.density || '')) density = state.density;
            reducedMotion = state.reducedMotion === true;
            highContrast = state.highContrast === true;
            sidebarOpen = state.sidebarOpen !== false;
            if (typeof state.sidebarWidth === 'number' && isFinite(state.sidebarWidth)) {
              sidebarWidth = Math.min(420, Math.max(200, state.sidebarWidth));
            }
            if (state.slideshowEnabled) { state.slideshowEnabled = false; dirty = true; }
            if (dirty) localStorage.setItem(themeKey, JSON.stringify(parsed));
          }
        } catch (e) {
          localStorage.removeItem(themeKey);
        }
      }
    }
    var surfaces = { white: '#ffffff', gray: '#1a1a1a', black: '#000000', beige: '#f4eddf' };
    document.documentElement.setAttribute('data-theme', core);
    document.documentElement.setAttribute('data-accent', accent);
    document.documentElement.setAttribute('data-font', font);
    // The font scales are read off body, where the next/font variables live. Set
    // here as well as in the provider so the first paint already has the right face
    // rather than flashing the default and correcting after hydration.
    if (document.body) {
      document.body.setAttribute('data-font', font);
      document.body.setAttribute('data-sidebar-font', sidebarFont);
      document.body.setAttribute('data-workspace-font', workspaceFont);
    }
    document.documentElement.setAttribute('data-density', density);
    document.documentElement.setAttribute('data-reduced-motion', reducedMotion ? 'true' : 'false');
    document.documentElement.setAttribute('data-high-contrast', highContrast ? 'true' : 'false');
    document.documentElement.style.backgroundColor = surfaces[core] || '#ffffff';
    document.documentElement.style.setProperty('--xv-boot-sidebar-width', sidebarOpen ? sidebarWidth + 'px' : '0px');
    var applyBody = function() {
      if (!document.body) return;
      document.body.classList.remove('theme-image','theme-white','theme-black','theme-gray','theme-beige','xv-deep-work-shell');
      document.body.classList.add('theme-' + core);
      document.body.style.backgroundColor = surfaces[core] || '#ffffff';
      document.body.style.backgroundImage = '';
    };
    if (document.body) applyBody();
    else {
      var observer = new MutationObserver(function() {
        if (!document.body) return;
        applyBody();
        observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true });
      document.addEventListener('DOMContentLoaded', applyBody, { once: true });
    }
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
