/**
 * Deterministic pre-ship polish: working theme toggle, no dead xroga.com CTAs,
 * Lucide icons instead of emoji. Runs after model emit / interactive QA.
 */

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

const DEAD_XROGA_HREF =
  /href\s*=\s*["']https?:\/\/(?:www\.)?xroga\.com\/?(?:[#"']|["'])/gi;

const LUCIDE_CDN =
  'https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js';

export function stripEmojiFromSiteText(html: string): string {
  return html.replace(EMOJI_RE, '').replace(/[ \t]{2,}/g, ' ');
}

/** Replace product CTAs that point at xroga.com (preview origin / refused to connect). */
export function neutralizeDeadProductLinks(html: string): string {
  return html
    .replace(DEAD_XROGA_HREF, 'href="#contact"')
    .replace(
      /href\s*=\s*["']https?:\/\/(?:www\.)?xroga\.com[^"']*["']/gi,
      'href="#"'
    );
}

function hasLucide(html: string, js: string): boolean {
  return /lucide/i.test(html) || /lucide/i.test(js) || /data-lucide=/i.test(html);
}

function injectLucide(html: string, js: string): { html: string; js: string } {
  let nextHtml = html;
  let nextJs = js;
  if (!hasLucide(nextHtml, nextJs)) {
    if (/<\/head>/i.test(nextHtml)) {
      nextHtml = nextHtml.replace(
        /<\/head>/i,
        `<script src="${LUCIDE_CDN}" defer><\/script>\n</head>`
      );
    } else if (/<\/body>/i.test(nextHtml)) {
      nextHtml = nextHtml.replace(
        /<\/body>/i,
        `<script src="${LUCIDE_CDN}"><\/script>\n</body>`
      );
    } else {
      nextHtml += `\n<script src="${LUCIDE_CDN}"><\/script>`;
    }
  }
  if (!/createIcons\s*\(/.test(nextJs) && !/lucide\.createIcons/.test(nextJs)) {
    nextJs = `${nextJs.trim()}\n\ntry { if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons(); } catch (_) {}\n`;
  }
  return { html: nextHtml, js: nextJs };
}

/** Map common decorative emoji left in markup to Lucide data attributes. */
function emojiToLucidePlaceholders(html: string): string {
  const map: Array<[RegExp, string]> = [
    [/☀️|🌞/g, '<i data-lucide="sun" aria-hidden="true"></i>'],
    [/🌙|🌛|🌜/g, '<i data-lucide="moon" aria-hidden="true"></i>'],
    [/⭐|✨/g, '<i data-lucide="sparkles" aria-hidden="true"></i>'],
    [/🚀/g, '<i data-lucide="rocket" aria-hidden="true"></i>'],
    [/💬|🗨️/g, '<i data-lucide="message-circle" aria-hidden="true"></i>'],
    [/📧|✉️/g, '<i data-lucide="mail" aria-hidden="true"></i>'],
    [/🔍/g, '<i data-lucide="search" aria-hidden="true"></i>'],
    [/⚙️|⚙/g, '<i data-lucide="settings" aria-hidden="true"></i>'],
    [/✅|✔️|✓/g, '<i data-lucide="check" aria-hidden="true"></i>'],
    [/➡️|→/g, '<i data-lucide="arrow-right" aria-hidden="true"></i>'],
  ];
  let out = html;
  for (const [re, rep] of map) out = out.replace(re, rep);
  return out;
}

const THEME_CSS = `
:root, [data-theme="light"] {
  color-scheme: light;
  --bg: #f4f7fb;
  --fg: #0f172a;
  --muted: #475569;
  --card: #ffffff;
  --accent: #2563eb;
  --border: #e2e8f0;
}
[data-theme="dark"], .dark {
  color-scheme: dark;
  --bg: #0b1220;
  --fg: #e2e8f0;
  --muted: #94a3b8;
  --card: #111827;
  --accent: #60a5fa;
  --border: #1f2937;
}
html, body { background: var(--bg); color: var(--fg); }
.xroga-theme-toggle {
  position: fixed; top: 1rem; right: 1rem; z-index: 50;
  display: inline-flex; align-items: center; gap: 0.4rem;
  border: 1px solid var(--border); background: var(--card); color: var(--fg);
  border-radius: 999px; padding: 0.45rem 0.75rem; cursor: pointer;
  font: inherit; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}
.xroga-theme-toggle:hover { border-color: var(--accent); }
.xroga-theme-toggle svg { width: 1rem; height: 1rem; }
`;

const THEME_JS = `
(function () {
  var root = document.documentElement;
  var KEY = 'xroga-theme';
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    var btn = document.getElementById('theme-toggle') || document.querySelector('[data-theme-toggle]');
    if (btn) {
      var next = theme === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-label', 'Switch to ' + next + ' mode');
      btn.innerHTML = theme === 'dark'
        ? '<i data-lucide="sun" aria-hidden="true"></i><span>Day</span>'
        : '<i data-lucide="moon" aria-hidden="true"></i><span>Night</span>';
      try { if (window.lucide) lucide.createIcons(); } catch (_) {}
    }
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (_) {}
  var preferDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  apply(saved === 'light' || saved === 'dark' ? saved : (preferDark ? 'dark' : 'light'));
  function wire(el) {
    if (!el || el.dataset.xrogaThemeWired) return;
    el.dataset.xrogaThemeWired = '1';
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var cur = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      apply(cur === 'dark' ? 'light' : 'dark');
    });
  }
  wire(document.getElementById('theme-toggle'));
  document.querySelectorAll('[data-theme-toggle], .theme-toggle, .night-day-toggle, button[aria-label*="theme" i], button[aria-label*="dark" i], button[aria-label*="night" i]').forEach(wire);
})();
`;

function wantsThemeToggle(prompt: string): boolean {
  return /\b(night.?day|day.?night|dark.?mode|light.?mode|theme.?toggle|color.?scheme)\b/i.test(
    prompt
  );
}

function hasWorkingThemeToggle(html: string, css: string, js: string): boolean {
  const blob = `${html}\n${css}\n${js}`;
  const hasControl =
    /id=["']theme-toggle["']|data-theme-toggle|theme-toggle|night-day/i.test(blob);
  const hasLogic =
    /data-theme|classList\.(add|toggle|remove).*dark|prefers-color-scheme|localStorage.*theme/i.test(
      blob
    );
  return hasControl && hasLogic;
}

function ensureThemeToggle(
  prompt: string,
  html: string,
  css: string,
  js: string
): { html: string; css: string; js: string } {
  if (!wantsThemeToggle(prompt) && hasWorkingThemeToggle(html, css, js)) {
    return { html, css, js };
  }
  if (!wantsThemeToggle(prompt) && !/theme-toggle|data-theme|night|dark.?mode/i.test(`${html}${js}`)) {
    return { html, css, js };
  }
  if (hasWorkingThemeToggle(html, css, js)) {
    // Still append robust wiring so broken model toggles work
    return {
      html,
      css: /xroga-theme-toggle/.test(css) ? css : `${css}\n${THEME_CSS}`,
      js: /xroga-theme-wired|KEY = 'xroga-theme'/.test(js) ? js : `${js}\n${THEME_JS}`,
    };
  }

  let nextHtml = html;
  if (!/id=["']theme-toggle["']|data-theme-toggle/i.test(nextHtml)) {
    const btn =
      '<button type="button" id="theme-toggle" class="xroga-theme-toggle" data-theme-toggle aria-label="Toggle night and day mode"><i data-lucide="moon" aria-hidden="true"></i><span>Night</span></button>';
    if (/<body[^>]*>/i.test(nextHtml)) {
      nextHtml = nextHtml.replace(/<body([^>]*)>/i, `<body$1>\n${btn}`);
    } else {
      nextHtml = `${btn}\n${nextHtml}`;
    }
  }

  const nextCss = /xroga-theme-toggle|--bg:/.test(css) ? css : `${css}\n${THEME_CSS}`;
  const nextJs = /KEY = 'xroga-theme'/.test(js) ? js : `${js}\n${THEME_JS}`;
  return { html: nextHtml, css: nextCss, js: nextJs };
}

export function polishShippedSite(
  prompt: string,
  site: { html: string; css: string; js: string }
): { html: string; css: string; js: string } {
  let html = site.html || '';
  let css = site.css || '';
  let js = site.js || '';

  html = neutralizeDeadProductLinks(html);
  html = emojiToLucidePlaceholders(html);
  html = stripEmojiFromSiteText(html);
  // Keep lucide tags; strip leftover emoji in css/js comments lightly
  css = css.replace(EMOJI_RE, '');
  js = js.replace(EMOJI_RE, '');

  const themed = ensureThemeToggle(prompt, html, css, js);
  html = themed.html;
  css = themed.css;
  js = themed.js;

  const withIcons = injectLucide(html, js);
  return { html: withIcons.html, css, js: withIcons.js };
}

/** Prefer brand from title / h1 over generic parser fallbacks. */
export function extractProjectNameFromHtml(html: string): string | null {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) {
    const brand = title.split(/[|—–\-·]/)[0]?.trim();
    if (brand && brand.length >= 2 && brand.length <= 48 && !/^xroga/i.test(brand) && !/website is ready/i.test(brand)) {
      return brand;
    }
  }
  // Logo / brand text in header (OrbitVault, etc.)
  const brandEl = html.match(
    /<(?:a|span|div)[^>]*(?:class|id)=["'][^"']*(?:logo|brand|site-name)[^"']*["'][^>]*>([\s\S]*?)<\//i
  )?.[1]
    ?.replace(/<[^>]+>/g, '')
    .trim();
  if (brandEl && brandEl.length >= 2 && brandEl.length <= 40) return brandEl.split(/\s+/).slice(0, 3).join(' ');

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
  if (h1 && h1.length >= 2 && h1.length <= 40 && !/modern landing|build a |cross-chain|command/i.test(h1)) {
    return h1.split(/\s+/).slice(0, 3).join(' ');
  }
  return null;
}

/**
 * Pick the real current project HTML for updates.
 * Prefer OrbitVault-style prior/workspace over a wrongly rebuilt "Crypto Pulse" on GitHub.
 */
export function pickUpdateSiteBase(
  github: { html: string; css: string; js: string } | null | undefined,
  prior: { html: string; css?: string; js?: string; projectName?: string } | null | undefined
): { html: string; css: string; js: string } | null {
  const g = github?.html?.trim()
    ? { html: github.html, css: github.css || '', js: github.js || '' }
    : null;
  const p = prior?.html?.trim()
    ? { html: prior.html, css: prior.css || '', js: prior.js || '' }
    : null;
  if (!g && !p) return null;
  if (!g) return p;
  if (!p) return g;

  const gName = (extractProjectNameFromHtml(g.html) || '').toLowerCase();
  const pName = (prior?.projectName || extractProjectNameFromHtml(p.html) || '').toLowerCase();

  // GitHub was overwritten by a bad full rebuild (Crypto Pulse) — restore the live prior project.
  if (pName && gName && pName !== gName) {
    if (/orbit|vault/.test(pName) || (/pulse/.test(gName) && !/pulse/.test(pName))) {
      return p;
    }
  }
  // Richer dashboard (swap/stake/wallet) wins over thin Pulse table
  const pRich = /\b(swap|stake|wallet|connect wallet|orbit)\b/i.test(p.html);
  const gRich = /\b(swap|stake|wallet|connect wallet|orbit)\b/i.test(g.html);
  if (pRich && !gRich) return p;
  if (p.html.length > g.html.length * 1.25 && pRich) return p;

  return g;
}
