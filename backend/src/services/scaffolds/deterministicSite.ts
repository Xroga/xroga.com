/**
 * The deterministic static site fallback.
 *
 * This is what a user receives when every builder provider returns empty,
 * prose-only or invalid output. It has to be a real page, not a stub: the previous
 * static scaffold emitted `<h1>{projectName}</h1>` with a zero-byte stylesheet and
 * a zero-byte script, which deploys but is not a product.
 *
 * Everything here is derived from the prompt with pure string work — no model call,
 * no network, no randomness, no clock. That matters twice over: the fallback must
 * work precisely when providers do not, and a worker restart must regenerate the
 * identical tree so a resumed run does not diverge from its checkpoint.
 *
 * It is deliberately modest. The goal is a valid, themed, buildable foundation that
 * the install/validate and shipping stages can carry to a live URL, and that a
 * healthy provider can later enhance — not a pretend implementation of whatever the
 * user asked for. Nothing here claims to be more than it is.
 */

export type SiteTheme = 'dark' | 'light';

export interface DeterministicSite {
  readonly title: string;
  readonly tagline: string;
  readonly theme: SiteTheme;
  readonly sections: readonly string[];
  readonly html: string;
  readonly css: string;
  readonly js: string;
}

/** Words that mean "make it dark" in an ordinary product prompt. */
const DARK_HINTS = ['dark', 'night', 'midnight', 'black', 'noir'];
const LIGHT_HINTS = ['light mode', 'light theme', 'white theme', 'minimal white'];

/** Section words worth turning into real page sections when the prompt mentions them. */
const SECTION_HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\babout\b/i, 'About'],
  [/\bwork|portfolio|project/i, 'Work'],
  [/\bservice|offer/i, 'Services'],
  [/\bproduct|coffee|blend|shop/i, 'Products'],
  [/\bmenu\b/i, 'Menu'],
  [/\bprice|pricing|plan/i, 'Pricing'],
  [/\bteam\b/i, 'Team'],
  [/\bblog|article|post/i, 'Blog'],
  [/\bgallery|photo|image/i, 'Gallery'],
  [/\bfaq|question/i, 'FAQ'],
  [/\bcontact|email|reach/i, 'Contact'],
];

export function detectTheme(prompt: string): SiteTheme {
  const lower = prompt.toLowerCase();
  if (LIGHT_HINTS.some((hint) => lower.includes(hint))) return 'light';
  return DARK_HINTS.some((hint) => new RegExp(`\\b${hint}\\b`).test(lower)) ? 'dark' : 'light';
}

/**
 * A human title from the prompt.
 *
 * Strips the instruction verb so "Build a portfolio website for Sam" becomes
 * "Portfolio Website For Sam" rather than "Build A Portfolio Website For Sam".
 */
export function titleFromPrompt(prompt: string, fallback: string): string {
  const cleaned = prompt
    .replace(/^\s*(please\s+)?(build|create|make|generate|design|develop)\s+(me\s+)?(a|an|the)?\s*/i, '')
    .replace(/\bwith\b[\s\S]*$/i, '')
    .replace(/[.!?].*$/s, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  const words = cleaned.split(' ').slice(0, 6);
  return words
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export function sectionsFromPrompt(prompt: string): string[] {
  const found = SECTION_HINTS.filter(([pattern]) => pattern.test(prompt)).map(([, label]) => label);
  // Always give the page somewhere to go; a nav with one link is not a page.
  const base = found.length >= 2 ? found : ['About', ...found.filter((s) => s !== 'About'), 'Contact'];
  return [...new Set(base)].slice(0, 5);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function exactQuotedValue(prompt: string, pattern: RegExp): string | null {
  const match = prompt.match(pattern);
  return match?.[1]?.trim() || null;
}

function requestedCardCount(prompt: string): number {
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };
  const match = prompt.match(/\b(one|two|three|four|five|six|[1-6])\s+product\s+cards?\b/i);
  if (!match) return /\bcoffee|shop|store|product\b/i.test(prompt) ? 3 : 0;
  return words[match[1].toLowerCase()] ?? Number(match[1]);
}

/**
 * Builds the site.
 *
 * The prompt is echoed once, in the README and as the page's own description, so
 * the delivered project records what was asked for. It is escaped everywhere it
 * reaches HTML — a prompt is user input, and this file writes a real page.
 */
export function buildDeterministicSite(opts: {
  prompt: string;
  projectName: string;
}): DeterministicSite {
  const calledName = exactQuotedValue(opts.prompt, /\bcalled\s+['\"]?([^'\".\n]+)['\"]?/i);
  const title = calledName || titleFromPrompt(opts.prompt, opts.projectName);
  const theme = detectTheme(opts.prompt);
  const sections = sectionsFromPrompt(opts.prompt);
  const heroHeading =
    exactQuotedValue(opts.prompt, /\bheading\s+must\s+say\s+exactly\s+['\"]([^'\"]+)['\"]/i) ||
    title;
  const ctaLabel =
    exactQuotedValue(opts.prompt, /\b(?:button|cta)[^'\"\n]{0,80}['\"]([^'\"]+)['\"]/i) ||
    exactQuotedValue(opts.prompt, /['\"]([^'\"]+)['\"]\s+(?:button|cta)\b/i) ||
    'Get started';
  const cardCount = requestedCardCount(opts.prompt);
  const isCoffee = /\bcoffee|roast|blend|café|cafe\b/i.test(opts.prompt);
  const tagline = isCoffee
    ? 'Small-batch coffee, roasted with curiosity and served with intention.'
    : 'A focused product experience generated by Xroga, ready to own and extend.';
  const productNames = isCoffee
    ? ['Orbit House', 'Lunar Roast', 'Nebula Decaf', 'Eclipse Blend', 'Comet Cold Brew', 'Solar Espresso']
    : ['Foundation', 'Momentum', 'Signature', 'Eclipse', 'Horizon', 'Summit'];

  const nav = sections
    .map((section) => `        <a href="#${slug(section)}">${escapeHtml(section)}</a>`)
    .join('\n');

  const blocks = sections
    .map((section) => {
      if (section === 'Products' && cardCount > 0) {
        const cards = productNames
          .slice(0, cardCount)
          .map(
            (name, index) => `          <article class="product-card">
            <span class="product-number">0${index + 1}</span>
            <h3>${escapeHtml(name)}</h3>
            <p>${isCoffee ? 'A distinctive roast with a smooth finish and a curious edge.' : 'A considered product, designed to be clear and useful.'}</p>
          </article>`,
          )
          .join('\n');
        return `      <section id="products" class="section product-section">
        <div class="section-heading"><span>Selected collection</span><h2>Made for the moment.</h2></div>
        <!-- XROGA_PRODUCTS_START -->
        <div class="product-grid">
${cards}
        </div>
        <!-- XROGA_PRODUCTS_END -->
      </section>`;
      }
      return `      <section id="${slug(section)}" class="section">
        <h2>${escapeHtml(section)}</h2>
        <p>${
          section === 'About'
            ? `Welcome to ${escapeHtml(title)} — thoughtful craft, straightforward service, and a space designed to stay awhile.`
            : section === 'Contact'
              ? 'Visit us, say hello, or start an order. We would love to hear what you are curious about.'
              : `Explore our ${escapeHtml(section.toLowerCase())} and discover what makes this experience distinct.`
        }</p>
      </section>`;
    })
    .join('\n\n');

  const html = `    <div data-xroga-deterministic="v1">
    <header class="site-header">
      <a class="brand" href="#top">${escapeHtml(title)}</a>
      <nav class="site-nav">
${nav}
      </nav>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav-links">Menu</button>
    </header>

    <main id="top">
      <section class="hero">
        <p class="eyebrow">${isCoffee ? 'Independent coffee · Daily ritual' : 'Designed with purpose'}</p>
        <h1>${escapeHtml(heroHeading)}</h1>
        <p class="lede">${escapeHtml(tagline)}</p>
        <a class="cta" href="#${slug(sections.find((section) => section === 'Products') ?? sections[0] ?? 'about')}">${escapeHtml(ctaLabel)}</a>
      </section>

${blocks}
    </main>

    <footer class="site-footer">
      <p>${escapeHtml(title)}</p>
      <p>Made with care · Built with Xroga</p>
    </footer>
    </div>`;

  const dark = theme === 'dark';
  const css = `:root {
  --bg: ${dark ? '#0b0d10' : '#ffffff'};
  --surface: ${dark ? '#15191d' : '#f5f7fa'};
  --text: ${dark ? '#f2f5f8' : '#14181d'};
  --muted: ${dark ? '#9aa7b4' : '#54616e'};
  --border: ${dark ? '#242b33' : '#dfe4ea'};
  --accent: ${dark ? '#ffcf5a' : '#0a63d8'};
  --accent-ink: ${dark ? '#06121f' : '#ffffff'};
  --radius: 18px;
  --max: 1180px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background:
    radial-gradient(circle at 78% 10%, ${dark ? 'rgba(255, 207, 90, .10)' : 'rgba(10, 99, 216, .08)'}, transparent 32rem),
    var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
}

a { color: var(--accent); }

.site-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  width: min(var(--max), calc(100% - 2.5rem));
  margin: 0 auto;
  padding: 1.4rem 0;
  border-bottom: 1px solid var(--border);
}

.brand { font-weight: 760; letter-spacing: -0.03em; text-decoration: none; color: var(--text); }

.site-nav { display: none; gap: 1.25rem; margin-left: auto; }
.site-nav a { text-decoration: none; color: var(--muted); }
.site-nav a:hover { color: var(--text); }
.site-nav.is-open { display: flex; flex-direction: column; position: absolute; top: 4rem; right: 1.25rem; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }

.nav-toggle {
  margin-left: auto;
  min-height: 40px;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}

@media (min-width: 720px) {
  .site-nav { display: flex; }
  .nav-toggle { display: none; }
}

main { width: min(var(--max), calc(100% - 2.5rem)); margin: 0 auto; }

.hero { min-height: 68vh; display: grid; align-content: center; padding: 5rem 0 4rem; }
.eyebrow { margin: 0 0 1rem; color: var(--accent); font-size: .72rem; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
.hero h1 { margin: 0; max-width: 13ch; font-size: clamp(3.1rem, 9vw, 7.5rem); letter-spacing: -.065em; line-height: .88; text-wrap: balance; }
.lede { max-width: 48ch; margin: 1.6rem 0 0; color: var(--muted); font-size: clamp(1rem, 2vw, 1.25rem); }

.cta {
  display: inline-block;
  margin-top: 1.25rem;
  padding: 0.75rem 1.25rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 750;
  text-decoration: none;
}
.cta:focus-visible, .nav-toggle:focus-visible, .site-nav a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.section {
  padding: clamp(3rem, 7vw, 6rem) 0;
  border-top: 1px solid var(--border);
}
.section h2 { margin: 0 0 0.75rem; font-size: clamp(2rem, 4vw, 4rem); letter-spacing: -.045em; line-height: 1; }
.section p { margin: 0; max-width: 60ch; color: var(--muted); }

.section-heading span, .product-number { color: var(--accent); font-size: .72rem; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
.product-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 1rem; margin-top: 2rem; }
.product-card { min-height: 220px; display: flex; flex-direction: column; justify-content: flex-end; padding: 1.4rem; border: 1px solid var(--border); border-radius: var(--radius); background: linear-gradient(145deg, var(--surface), color-mix(in srgb, var(--surface), var(--accent) 8%)); }
.product-card h3 { margin: auto 0 .5rem; font-size: 1.4rem; letter-spacing: -.03em; }
.product-card p { font-size: .94rem; }

.site-footer {
  width: min(var(--max), calc(100% - 2.5rem));
  margin: 3rem auto 0;
  padding: 1.5rem 0;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  color: var(--muted);
  font-size: 0.9rem;
}

@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; }
}
`;

  const js = `// Mobile navigation. Kept dependency-free so the page works as plain static files.
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.site-nav');
  if (!toggle || !nav) return;

  nav.id = nav.id || 'site-nav-links';

  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  // Close after following an in-page link, so the panel does not cover the target.
  nav.addEventListener('click', function (event) {
    if (event.target instanceof HTMLAnchorElement) {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
})();
`;

  return { title, tagline, theme, sections, html, css, js };
}

/**
 * Apply only explicit, structurally safe follow-ups to a site generated above.
 * Returning null is deliberate: an unrecognised update must go back to the model,
 * never guess at edits to arbitrary customer code.
 */
export function applyDeterministicStaticUpdate(
  files: ReadonlyArray<{ path: string; content: string }>,
  prompt: string,
): Array<{ path: string; content: string }> | null {
  const index = files.find((file) => file.path === 'index.html');
  if (!index?.content.includes('data-xroga-deterministic="v1"')) return null;

  let html = index.content;
  let changed = false;
  const buttonChange = prompt.match(
    /\bchange\s+(?:the\s+)?(?:main\s+)?button\s+text\s+from\s+['\"]([^'\"]+)['\"]\s+to\s+['\"]([^'\"]+)['\"]/i,
  );
  if (buttonChange) {
    const from = escapeHtml(buttonChange[1]);
    const to = escapeHtml(buttonChange[2]);
    const next = html.replace(`>${from}</a>`, `>${to}</a>`);
    changed ||= next !== html;
    html = next;
  }

  const card = prompt.match(
    /\badd\s+(?:a\s+)?(?:fourth|new|another)?\s*product\s+card\s+called\s+['\"]([^'\"]+)['\"]/i,
  );
  if (card && !html.includes(`>${escapeHtml(card[1])}</h3>`)) {
    const insertion = `          <article class="product-card">
            <span class="product-number">NEW</span>
            <h3>${escapeHtml(card[1])}</h3>
            <p>A fresh addition with a distinctive profile and a smooth finish.</p>
          </article>\n`;
    const next = html.replace('        </div>\n        <!-- XROGA_PRODUCTS_END -->', `${insertion}        </div>\n        <!-- XROGA_PRODUCTS_END -->`);
    changed ||= next !== html;
    html = next;
  }

  const section = prompt.match(
    /\badd\s+(?:a\s+)?new\s+section\s+titled\s+['\"]([^'\"]+)['\"]/i,
  );
  if (section && !html.includes(`>${escapeHtml(section[1])}</h2>`)) {
    const id = slug(section[1]);
    const block = `      <section id="${id}" class="section feature-section">
        <p class="eyebrow">Fresh from the roaster</p>
        <h2>${escapeHtml(section[1])}</h2>
        <p>Discover the newest releases, prepared this week and ready to explore.</p>
      </section>\n\n`;
    const next = html.replace('    </main>', `${block}    </main>`);
    changed ||= next !== html;
    html = next;
  }

  if (!changed) return null;
  return files.map((file) =>
    file.path === 'index.html'
      ? { ...file, content: html }
      : file.path === 'README.md'
        ? { ...file, content: `${file.content.trimEnd()}\n\n## Latest update\n\n${prompt.slice(0, 500)}\n` }
        : { ...file },
  );
}
