import type {
  ProjectFile,
} from '../ai/patches.js';

function escapeHtml(
  value: string,
): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cleanBrand(
  value: string,
): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.!?,;:]+$/g, '')
    .trim()
    .slice(0, 80);
}

export function staticWebBrandFromPrompt(
  prompt: string,
): string {
  const patterns = [
    /\b(?:named|called)\s+["“']([^"”']{1,80})["”']/i,
    /\bname\s+is\s+["“']?([^\n,.]{1,80})["”']?/i,
    /\b(?:named|called)\s+([^\n,.]{1,80})/i,
  ];

  for (
    const pattern of
    patterns
  ) {
    const match =
      prompt.match(
        pattern,
      );

    const candidate =
      cleanBrand(
        match?.[1] ??
        '',
      );

    if (candidate) {
      return candidate;
    }
  }

  return 'Studio One';
}

export function createStaticWebBootstrap(
  prompt: string,
): readonly ProjectFile[] {
  const brand =
    staticWebBrandFromPrompt(
      prompt,
    );

  const safeBrand =
    escapeHtml(
      brand,
    );

  const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta
    name="description"
    content="${safeBrand} — a modern creative studio crafting memorable digital experiences."
  />
  <meta name="theme-color" content="#0b1020" />

  <title>${safeBrand} — Creative Studio</title>

  <link
    rel="stylesheet"
    href="styles.css"
  />
</head>

<body>
  <a
    class="skip-link"
    href="#main"
  >
    Skip to content
  </a>

  <header
    class="site-header"
    data-header
  >
    <div class="shell nav-wrap">
      <a
        class="brand"
        href="#top"
        aria-label="${safeBrand} home"
      >
        ${safeBrand}
      </a>

      <button
        class="nav-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="primary-nav"
        data-nav-toggle
      >
        <span></span>
        <span></span>
        <span></span>

        <span class="sr-only">
          Toggle navigation
        </span>
      </button>

      <nav
        class="nav"
        id="primary-nav"
        aria-label="Primary navigation"
        data-nav
      >
        <a href="#services">
          Services
        </a>

        <a href="#work">
          Work
        </a>

        <a href="#about">
          About
        </a>

        <a
          href="#contact"
          class="nav-cta"
        >
          Start a project
        </a>
      </nav>
    </div>
  </header>

  <main id="main">
    <section
      class="hero"
      id="top"
    >
      <div
        class="hero-orb hero-orb-a"
        aria-hidden="true"
      ></div>

      <div
        class="hero-orb hero-orb-b"
        aria-hidden="true"
      ></div>

      <div class="shell hero-grid">
        <div class="hero-copy reveal">
          <p class="eyebrow">
            Independent creative studio
          </p>

          <h1>
            We turn bold ideas into
            <span>
              digital experiences people remember.
            </span>
          </h1>

          <p class="hero-lede">
            ${safeBrand} blends strategy, design, and front-end craft
            to build identities and websites that feel clear,
            premium, and alive.
          </p>

          <div class="hero-actions">
            <a
              class="button button-primary"
              href="#contact"
            >
              Build something great
            </a>

            <a
              class="button button-ghost"
              href="#work"
            >
              See selected work
            </a>
          </div>

          <div
            class="hero-proof"
            aria-label="Studio highlights"
          >
            <div>
              <strong>24+</strong>
              <span>launches</span>
            </div>

            <div>
              <strong>8 yrs</strong>
              <span>combined craft</span>
            </div>

            <div>
              <strong>4.9/5</strong>
              <span>client rating</span>
            </div>
          </div>
        </div>

        <div
          class="hero-card reveal"
          aria-label="Featured project preview"
        >
          <div class="hero-card-top">
            <span class="status-dot"></span>

            <span>
              Featured launch
            </span>

            <span class="hero-card-index">
              01 / 03
            </span>
          </div>

          <div
            class="hero-art"
            aria-hidden="true"
          >
            <div class="hero-art-ring"></div>
            <div class="hero-art-disc"></div>

            <div class="hero-art-label">
              JM
            </div>
          </div>

          <div class="hero-card-bottom">
            <div>
              <p>
                Northline Objects
              </p>

              <span>
                Brand system · Web design
              </span>
            </div>

            <span class="arrow">
              ↗
            </span>
          </div>
        </div>
      </div>
    </section>

    <section
      class="marquee"
      aria-label="Capabilities"
    >
      <div class="marquee-track">
        <span>Strategy</span>
        <i>✦</i>

        <span>Brand systems</span>
        <i>✦</i>

        <span>Web design</span>
        <i>✦</i>

        <span>Front-end</span>
        <i>✦</i>

        <span>Creative direction</span>
        <i>✦</i>

        <span aria-hidden="true">
          Strategy
        </span>

        <i aria-hidden="true">
          ✦
        </i>

        <span aria-hidden="true">
          Brand systems
        </span>

        <i aria-hidden="true">
          ✦
        </i>

        <span aria-hidden="true">
          Web design
        </span>

        <i aria-hidden="true">
          ✦
        </i>

        <span aria-hidden="true">
          Front-end
        </span>

        <i aria-hidden="true">
          ✦
        </i>

        <span aria-hidden="true">
          Creative direction
        </span>

        <i aria-hidden="true">
          ✦
        </i>
      </div>
    </section>

    <section
      class="section"
      id="services"
    >
      <div class="shell">
        <div class="section-heading reveal">
          <p class="eyebrow">
            What we do
          </p>

          <h2>
            From first idea to final pixel.
          </h2>

          <p>
            Small senior teams, clear thinking, and enough obsession
            to make the details feel effortless.
          </p>
        </div>

        <div class="service-grid">
          <article class="service-card reveal">
            <span class="service-number">
              01
            </span>

            <h3>
              Brand direction
            </h3>

            <p>
              Positioning, visual language, art direction, and flexible
              systems built to stay coherent as you grow.
            </p>

            <ul>
              <li>Identity systems</li>
              <li>Creative direction</li>
              <li>Launch toolkits</li>
            </ul>
          </article>

          <article class="service-card reveal">
            <span class="service-number">
              02
            </span>

            <h3>
              Web experiences
            </h3>

            <p>
              Responsive, accessible websites with expressive
              interaction and a strong editorial point of view.
            </p>

            <ul>
              <li>UX &amp; UI design</li>
              <li>Responsive systems</li>
              <li>Interaction design</li>
            </ul>
          </article>

          <article class="service-card reveal">
            <span class="service-number">
              03
            </span>

            <h3>
              Digital launch
            </h3>

            <p>
              Production-ready front-end implementation that protects
              the design while keeping performance sharp.
            </p>

            <ul>
              <li>Front-end build</li>
              <li>Performance polish</li>
              <li>Launch support</li>
            </ul>
          </article>
        </div>
      </div>
    </section>

    <section
      class="section work-section"
      id="work"
    >
      <div class="shell">
        <div class="section-heading section-heading-inline reveal">
          <div>
            <p class="eyebrow">
              Selected work
            </p>

            <h2>
              Recent collaborations.
            </h2>
          </div>

          <a
            class="text-link"
            href="#contact"
          >
            Discuss your project ↗
          </a>
        </div>

        <div class="work-grid">
          <article class="work-card work-card-large reveal">
            <div class="work-visual visual-one">
              <span>
                Aster / 24
              </span>
            </div>

            <div class="work-meta">
              <div>
                <h3>
                  Aster House
                </h3>

                <p>
                  Hospitality · Brand + digital
                </p>
              </div>

              <span>
                2026
              </span>
            </div>
          </article>

          <article class="work-card reveal">
            <div class="work-visual visual-two">
              <span>
                FORM—09
              </span>
            </div>

            <div class="work-meta">
              <div>
                <h3>
                  Form Objects
                </h3>

                <p>
                  Product · E-commerce
                </p>
              </div>

              <span>
                2026
              </span>
            </div>
          </article>

          <article class="work-card reveal">
            <div class="work-visual visual-three">
              <span>
                NOCT / RN
              </span>
            </div>

            <div class="work-meta">
              <div>
                <h3>
                  Nocturne
                </h3>

                <p>
                  Culture · Campaign site
                </p>
              </div>

              <span>
                2025
              </span>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="section quote-section">
      <div class="shell quote-grid reveal">
        <p class="eyebrow">
          Client note
        </p>

        <blockquote>
          “They understood the ambition immediately, simplified the hard
          parts, and gave us a site that finally feels like the company
          we are becoming.”
        </blockquote>

        <div class="quote-person">
          <span
            class="quote-avatar"
            aria-hidden="true"
          >
            AR
          </span>

          <div>
            <strong>
              Amelia Reed
            </strong>

            <span>
              Founder, Aster House
            </span>
          </div>
        </div>
      </div>
    </section>

    <section
      class="section about-section"
      id="about"
    >
      <div class="shell about-grid">
        <div class="reveal">
          <p class="eyebrow">
            About ${safeBrand}
          </p>

          <h2>
            Senior thinking without the agency layers.
          </h2>
        </div>

        <div class="about-copy reveal">
          <p>
            We are a compact creative studio for founders, teams,
            and brands that care how their ideas show up in the world.
          </p>

          <p>
            Our process stays collaborative from strategy through launch,
            so decisions remain intentional and nothing gets lost between
            design and implementation.
          </p>

          <div class="about-values">
            <div>
              <strong>
                Clarity first
              </strong>

              <span>
                Every choice should earn its place.
              </span>
            </div>

            <div>
              <strong>
                Craft matters
              </strong>

              <span>
                Details shape how a brand is remembered.
              </span>
            </div>

            <div>
              <strong>
                Built to last
              </strong>

              <span>
                Systems should scale beyond launch day.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section
      class="section contact-section"
      id="contact"
    >
      <div class="shell contact-card reveal">
        <p class="eyebrow">
          Have a project in mind?
        </p>

        <h2>
          Let’s make the next thing impossible to ignore.
        </h2>

        <p>
          Tell us what you are building, where you are stuck,
          and what a great outcome looks like.
        </p>

        <div class="contact-actions">
          <a
            class="button button-light"
            href="mailto:hello@example.com"
          >
            Start a conversation
          </a>

          <a
            class="button button-outline-light"
            href="#top"
          >
            Back to top ↑
          </a>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="shell footer-grid">
      <a
        class="brand"
        href="#top"
      >
        ${safeBrand}
      </a>

      <p>
        Creative direction, digital design, and front-end craft.
      </p>

      <div class="footer-links">
        <a href="#services">
          Services
        </a>

        <a href="#work">
          Work
        </a>

        <a href="#about">
          About
        </a>
      </div>

      <p class="copyright">
        © <span data-year></span> ${safeBrand}
      </p>
    </div>
  </footer>

  <script src="script.js"></script>
</body>
</html>
`;

  const stylesCss = `:root {
  --bg: #0b1020;
  --bg-soft: #10172a;
  --paper: #f3f1ea;
  --ink: #11131a;
  --muted: #6e7280;
  --line: rgba(17, 19, 26, 0.12);
  --acid: #d8ff4f;
  --violet: #8f7cff;
  --radius: 28px;
  --shell: min(1180px, calc(100% - 40px));
  --shadow: 0 30px 90px rgba(7, 12, 28, 0.18);
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  -webkit-font-smoothing: antialiased;
}

img {
  max-width: 100%;
  display: block;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}

button:focus-visible,
a:focus-visible {
  outline: 3px solid var(--violet);
  outline-offset: 4px;
}

.shell {
  width: var(--shell);
  margin-inline: auto;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.skip-link {
  position: fixed;
  left: 20px;
  top: 14px;
  z-index: 999;
  padding: 10px 14px;
  background: white;
  border-radius: 10px;
  transform: translateY(-160%);
  transition: transform 0.2s ease;
}

.skip-link:focus {
  transform: translateY(0);
}

.site-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 50;
  padding: 18px 0;
  color: white;
  transition:
    background 0.25s ease,
    padding 0.25s ease,
    border-color 0.25s ease;
  border-bottom: 1px solid transparent;
}

.site-header.is-scrolled {
  background: rgba(11, 16, 32, 0.86);
  backdrop-filter: blur(18px);
  padding: 12px 0;
  border-color: rgba(255, 255, 255, 0.08);
}

.nav-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
}

.brand {
  font-weight: 850;
  letter-spacing: -0.04em;
  font-size: 1.25rem;
}

.nav {
  display: flex;
  align-items: center;
  gap: 28px;
  font-size: 0.92rem;
}

.nav a {
  color: rgba(255, 255, 255, 0.78);
  transition: color 0.2s ease;
}

.nav a:hover {
  color: white;
}

.nav-cta {
  padding: 12px 18px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
}

.nav-toggle {
  display: none;
  background: transparent;
  border: 0;
  padding: 8px;
}

.nav-toggle span:not(.sr-only) {
  display: block;
  width: 24px;
  height: 2px;
  background: white;
  margin: 4px 0;
  border-radius: 999px;
}

.hero {
  position: relative;
  overflow: hidden;
  min-height: 820px;
  padding: 150px 0 90px;
  background: var(--bg);
  color: white;
  display: grid;
  align-items: center;
}

.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(
      rgba(255, 255, 255, 0.035) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.035) 1px,
      transparent 1px
    );
  background-size: 48px 48px;
  mask-image:
    linear-gradient(
      to bottom,
      black,
      transparent 82%
    );
}

.hero-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(12px);
  opacity: 0.62;
  pointer-events: none;
}

.hero-orb-a {
  width: 420px;
  height: 420px;
  right: -110px;
  top: 85px;
  background:
    radial-gradient(
      circle at 35% 35%,
      #ac9cff,
      #5644d8 62%,
      transparent 63%
    );
}

.hero-orb-b {
  width: 300px;
  height: 300px;
  left: 35%;
  bottom: -180px;
  background:
    radial-gradient(
      circle,
      rgba(216, 255, 79, 0.65),
      rgba(216, 255, 79, 0)
    );
}

.hero-grid {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1.12fr 0.88fr;
  align-items: center;
  gap: 70px;
}

.eyebrow {
  margin: 0 0 18px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.72rem;
  font-weight: 800;
  color: #8c90a1;
}

.hero .eyebrow {
  color: var(--acid);
}

.hero h1 {
  margin: 0;
  font-size:
    clamp(
      3.25rem,
      7vw,
      6.9rem
    );
  line-height: 0.91;
  letter-spacing: -0.07em;
  max-width: 780px;
  font-weight: 780;
}

.hero h1 span {
  color: #b9b6c7;
}

.hero-lede {
  max-width: 630px;
  margin: 30px 0 0;
  color: rgba(255, 255, 255, 0.68);
  font-size:
    clamp(
      1rem,
      1.4vw,
      1.18rem
    );
  line-height: 1.75;
}

.hero-actions {
  display: flex;
  gap: 12px;
  margin-top: 36px;
  flex-wrap: wrap;
}

.button {
  display: inline-flex;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  padding: 0 22px;
  border-radius: 999px;
  font-size: 0.92rem;
  font-weight: 760;
  transition:
    transform 0.2s ease,
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.button:hover {
  transform: translateY(-2px);
}

.button-primary {
  background: var(--acid);
  color: #10150b;
}

.button-ghost {
  border:
    1px solid
    rgba(
      255,
      255,
      255,
      0.2
    );
  color: white;
}

.hero-proof {
  display: flex;
  gap: 34px;
  margin-top: 54px;
  padding-top: 25px;
  border-top:
    1px solid
    rgba(
      255,
      255,
      255,
      0.1
    );
  max-width: 560px;
}

.hero-proof div {
  display: grid;
  gap: 4px;
}

.hero-proof strong {
  font-size: 1.05rem;
}

.hero-proof span {
  color:
    rgba(
      255,
      255,
      255,
      0.45
    );
  font-size: 0.78rem;
}

.hero-card {
  position: relative;
  min-height: 570px;
  border-radius: 34px;
  padding: 22px;
  background:
    linear-gradient(
      145deg,
      #eeeafc,
      #c7c1eb
    );
  color: #14131b;
  box-shadow:
    0 40px 110px
    rgba(
      0,
      0,
      0,
      0.34
    );
  overflow: hidden;
  transform: rotate(2.5deg);
}

.hero-card::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      120deg,
      rgba(
        255,
        255,
        255,
        0.45
      ),
      transparent 38%
    );
  pointer-events: none;
}

.hero-card-top,
.hero-card-bottom {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
}

.hero-card-top {
  gap: 8px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.hero-card-index {
  margin-left: auto;
  opacity: 0.5;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #48a96a;
  box-shadow:
    0 0 0 5px
    rgba(
      72,
      169,
      106,
      0.14
    );
}

.hero-art {
  position: relative;
  height: 410px;
  display: grid;
  place-items: center;
}

.hero-art-ring {
  position: absolute;
  width: 300px;
  aspect-ratio: 1;
  border-radius: 50%;
  border:
    1px solid
    rgba(
      20,
      19,
      27,
      0.18
    );
}

.hero-art-disc {
  position: absolute;
  width: 230px;
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    conic-gradient(
      from 35deg,
      #151522,
      #9082ff,
      #d8ff4f,
      #151522
    );
  box-shadow:
    inset 0 0 55px
      rgba(
        255,
        255,
        255,
        0.24
      ),
    0 28px 60px
      rgba(
        70,
        61,
        137,
        0.3
      );
  animation:
    slowSpin
    18s linear
    infinite;
}

.hero-art-label {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 92px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #f6f2ff;
  font-size: 1.6rem;
  font-weight: 900;
  letter-spacing: -0.05em;
  box-shadow:
    0 12px 30px
    rgba(
      0,
      0,
      0,
      0.2
    );
}

.hero-card-bottom {
  justify-content: space-between;
  align-items: flex-end;
}

.hero-card-bottom p {
  margin: 0 0 5px;
  font-weight: 850;
  font-size: 1.18rem;
}

.hero-card-bottom span {
  font-size: 0.8rem;
  opacity: 0.62;
}

.hero-card-bottom .arrow {
  opacity: 1;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: #151522;
  color: white;
  font-size: 1.1rem;
}

@keyframes slowSpin {
  to {
    transform: rotate(360deg);
  }
}

.marquee {
  overflow: hidden;
  background: var(--acid);
  color: #12150c;
  border-bottom:
    1px solid
    rgba(
      0,
      0,
      0,
      0.08
    );
}

.marquee-track {
  display: flex;
  width: max-content;
  align-items: center;
  gap: 24px;
  padding: 17px 0;
  font-weight: 840;
  letter-spacing: -0.02em;
  animation:
    marquee
    26s linear
    infinite;
}

.marquee-track span {
  font-size: 0.94rem;
}

.marquee-track i {
  font-style: normal;
  font-size: 0.72rem;
}

@keyframes marquee {
  to {
    transform:
      translateX(
        -50%
      );
  }
}

.section {
  padding:
    120px
    0;
}

.section-heading {
  display: grid;
  grid-template-columns:
    0.78fr
    1.35fr
    1fr;
  gap: 28px;
  align-items: start;
  margin-bottom: 55px;
}

.section-heading h2,
.about-section h2 {
  margin: 0;
  font-size:
    clamp(
      2.45rem,
      5vw,
      4.8rem
    );
  line-height: 0.98;
  letter-spacing: -0.055em;
  font-weight: 760;
}

.section-heading > p:last-child {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.7;
}

.service-grid {
  display: grid;
  grid-template-columns:
    repeat(
      3,
      1fr
    );
  border-top:
    1px solid
    var(--line);
}

.service-card {
  padding:
    34px
    30px
    28px
    0;
  border-right:
    1px solid
    var(--line);
  min-height: 390px;
}

.service-card + .service-card {
  padding-left: 30px;
}

.service-card:last-child {
  border-right: 0;
}

.service-number {
  color: #9296a2;
  font-size: 0.75rem;
}

.service-card h3 {
  margin:
    70px
    0
    18px;
  font-size: 1.65rem;
  letter-spacing: -0.035em;
}

.service-card p {
  color: var(--muted);
  line-height: 1.7;
}

.service-card ul {
  list-style: none;
  margin:
    30px
    0
    0;
  padding: 0;
  display: grid;
  gap: 10px;
  font-size: 0.88rem;
}

.service-card li {
  display: flex;
  gap: 9px;
  align-items: center;
}

.service-card li::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--violet);
}

.work-section {
  background: #e7e4dc;
}

.section-heading-inline {
  display: flex;
  justify-content: space-between;
  align-items: end;
}

.text-link {
  font-weight: 750;
  border-bottom:
    1px solid
    currentColor;
  padding-bottom: 3px;
}

.work-grid {
  display: grid;
  grid-template-columns:
    1.08fr
    0.92fr;
  gap: 22px;
}

.work-card-large {
  grid-row: span 2;
}

.work-visual {
  min-height: 310px;
  border-radius: 26px;
  overflow: hidden;
  padding: 22px;
  display: flex;
  align-items: flex-end;
  box-shadow: var(--shadow);
  transition:
    transform
    0.35s ease;
}

.work-card:hover .work-visual {
  transform:
    translateY(
      -5px
    );
}

.work-card-large .work-visual {
  min-height: 680px;
}

.work-visual span {
  padding:
    10px
    12px;
  border-radius: 999px;
  background:
    rgba(
      255,
      255,
      255,
      0.72
    );
  backdrop-filter:
    blur(
      8px
    );
  font-size: 0.75rem;
  font-weight: 850;
  letter-spacing: 0.08em;
}

.visual-one {
  background:
    radial-gradient(
      circle at 28% 20%,
      #ffcf9b,
      transparent 28%
    ),
    linear-gradient(
      150deg,
      #6b3f30 0 48%,
      #d2935f 49% 70%,
      #f0d6b0 71%
    );
}

.visual-two {
  background:
    radial-gradient(
      circle at 72% 30%,
      #d8ff4f 0 12%,
      transparent 13%
    ),
    linear-gradient(
      125deg,
      #181a22 0 52%,
      #8c7df4 53%
    );
  color: white;
}

.visual-three {
  background:
    radial-gradient(
      circle at 35% 45%,
      rgba(
        255,
        255,
        255,
        0.85
      ) 0 8%,
      transparent 9%
    ),
    linear-gradient(
      135deg,
      #31566a,
      #9dc7c0
    );
}

.work-meta {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 20px;
  padding:
    18px
    4px
    5px;
}

.work-meta h3 {
  margin:
    0
    0
    4px;
  font-size: 1.1rem;
}

.work-meta p,
.work-meta > span {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
}

.quote-section {
  background: var(--bg);
  color: white;
}

.quote-grid {
  display: grid;
  grid-template-columns:
    0.65fr
    2.2fr
    0.8fr;
  gap: 40px;
  align-items: start;
}

.quote-grid .eyebrow {
  color: var(--acid);
}

blockquote {
  margin: 0;
  font-size:
    clamp(
      2rem,
      4.2vw,
      4.1rem
    );
  line-height: 1.08;
  letter-spacing: -0.05em;
  color:
    rgba(
      255,
      255,
      255,
      0.92
    );
}

.quote-person {
  display: flex;
  gap: 12px;
  align-items: center;
  align-self: end;
}

.quote-avatar {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--violet);
  font-size: 0.72rem;
  font-weight: 900;
}

.quote-person div {
  display: grid;
  gap: 3px;
}

.quote-person strong {
  font-size: 0.88rem;
}

.quote-person div span {
  color:
    rgba(
      255,
      255,
      255,
      0.48
    );
  font-size: 0.76rem;
}

.about-grid {
  display: grid;
  grid-template-columns:
    1fr
    1fr;
  gap: 90px;
}

.about-copy > p {
  margin:
    0
    0
    24px;
  font-size: 1.15rem;
  line-height: 1.75;
  color: #505461;
}

.about-values {
  margin-top: 48px;
  border-top:
    1px solid
    var(--line);
}

.about-values div {
  display: grid;
  grid-template-columns:
    0.72fr
    1fr;
  gap: 20px;
  padding:
    20px
    0;
  border-bottom:
    1px solid
    var(--line);
}

.about-values span {
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.5;
}

.contact-section {
  padding-top: 40px;
}

.contact-card {
  padding:
    clamp(
      36px,
      7vw,
      88px
    );
  border-radius: 36px;
  background:
    linear-gradient(
      135deg,
      #765fff,
      #9b79ff 46%,
      #5540c6
    );
  color: white;
  overflow: hidden;
  position: relative;
}

.contact-card::after {
  content: "";
  position: absolute;
  width: 420px;
  height: 420px;
  right: -170px;
  top: -190px;
  border:
    1px solid
    rgba(
      255,
      255,
      255,
      0.28
    );
  border-radius: 50%;
  box-shadow:
    0 0 0 65px
      rgba(
        255,
        255,
        255,
        0.05
      ),
    0 0 0 130px
      rgba(
        255,
        255,
        255,
        0.035
      );
}

.contact-card .eyebrow {
  color: #e3ff86;
}

.contact-card h2 {
  max-width: 850px;
  margin: 0;
  font-size:
    clamp(
      2.7rem,
      6vw,
      6rem
    );
  line-height: 0.95;
  letter-spacing: -0.06em;
}

.contact-card > p:not(.eyebrow) {
  max-width: 620px;
  color:
    rgba(
      255,
      255,
      255,
      0.72
    );
  line-height: 1.7;
  font-size: 1.05rem;
}

.contact-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 34px;
  position: relative;
  z-index: 2;
}

.button-light {
  background: white;
  color: #2e245f;
}

.button-outline-light {
  border:
    1px solid
    rgba(
      255,
      255,
      255,
      0.38
    );
  color: white;
}

.footer {
  padding:
    40px
    0
    55px;
}

.footer-grid {
  display: grid;
  grid-template-columns:
    1fr
    1.2fr
    0.9fr
    auto;
  gap: 32px;
  align-items: start;
  border-top:
    1px solid
    var(--line);
  padding-top: 34px;
}

.footer-grid p {
  margin: 0;
  color: var(--muted);
  font-size: 0.84rem;
  line-height: 1.55;
}

.footer-links {
  display: flex;
  gap: 18px;
  font-size: 0.84rem;
  font-weight: 700;
}

.copyright {
  white-space: nowrap;
}

.reveal {
  opacity: 0;
  transform:
    translateY(
      20px
    );
  transition:
    opacity
    0.65s ease,
    transform
    0.65s ease;
}

.reveal.is-visible {
  opacity: 1;
  transform:
    translateY(
      0
    );
}

@media (max-width: 980px) {
  :root {
    --shell:
      min(
        100% - 32px,
        780px
      );
  }

  .hero {
    min-height: auto;
  }

  .hero-grid {
    grid-template-columns: 1fr;
  }

  .hero-card {
    min-height: 520px;
    max-width: 620px;
    width: 100%;
    justify-self: center;
    transform: rotate(1deg);
  }

  .section-heading {
    grid-template-columns: 1fr;
  }

  .service-grid {
    grid-template-columns: 1fr;
  }

  .service-card,
  .service-card + .service-card {
    padding:
      30px
      0;
    border-right: 0;
    border-bottom:
      1px solid
      var(--line);
    min-height: auto;
  }

  .service-card h3 {
    margin-top: 34px;
  }

  .work-grid {
    grid-template-columns: 1fr;
  }

  .work-card-large {
    grid-row: auto;
  }

  .work-card-large .work-visual,
  .work-visual {
    min-height: 520px;
  }

  .quote-grid {
    grid-template-columns: 1fr;
  }

  .quote-person {
    margin-top: 16px;
  }

  .about-grid {
    grid-template-columns: 1fr;
    gap: 45px;
  }

  .footer-grid {
    grid-template-columns:
      1fr
      1fr;
  }
}

@media (max-width: 720px) {
  :root {
    --shell:
      min(
        100% - 24px,
        640px
      );
  }

  .site-header {
    padding-top: 12px;
  }

  .nav-toggle {
    display: block;
    position: relative;
    z-index: 2;
  }

  .nav {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: grid;
    gap: 0;
    padding:
      82px
      20px
      24px;
    background:
      rgba(
        11,
        16,
        32,
        0.98
      );
    transform:
      translateY(
        -110%
      );
    transition:
      transform
      0.28s ease;
    border-bottom:
      1px solid
      rgba(
        255,
        255,
        255,
        0.08
      );
  }

  .nav.is-open {
    transform:
      translateY(
        0
      );
  }

  .nav a {
    padding:
      15px
      4px;
    border-bottom:
      1px solid
      rgba(
        255,
        255,
        255,
        0.08
      );
  }

  .nav-cta {
    margin-top: 12px;
    border:
      1px solid
      rgba(
        255,
        255,
        255,
        0.24
      ) !important;
    text-align: center;
  }

  .hero {
    padding:
      125px
      0
      65px;
  }

  .hero h1 {
    font-size:
      clamp(
        3.1rem,
        15vw,
        5rem
      );
  }

  .hero-proof {
    gap: 18px;
    justify-content: space-between;
  }

  .hero-card {
    min-height: 430px;
    border-radius: 26px;
  }

  .hero-art {
    height: 305px;
  }

  .hero-art-ring {
    width: 235px;
  }

  .hero-art-disc {
    width: 180px;
  }

  .section {
    padding:
      84px
      0;
  }

  .section-heading-inline {
    display: grid;
    align-items: start;
  }

  .work-card-large .work-visual,
  .work-visual {
    min-height: 390px;
  }

  .about-values div {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .contact-card {
    border-radius: 26px;
  }

  .footer-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }

  .reveal {
    opacity: 1;
    transform: none;
  }
}
`;

  const scriptJs = `const header =
  document.querySelector(
    '[data-header]',
  );

const nav =
  document.querySelector(
    '[data-nav]',
  );

const toggle =
  document.querySelector(
    '[data-nav-toggle]',
  );

const setHeaderState =
  () => {
    header?.classList.toggle(
      'is-scrolled',
      window.scrollY > 24,
    );
  };

setHeaderState();

window.addEventListener(
  'scroll',
  setHeaderState,
  {
    passive: true,
  },
);

toggle?.addEventListener(
  'click',
  () => {
    const open =
      toggle.getAttribute(
        'aria-expanded',
      ) === 'true';

    toggle.setAttribute(
      'aria-expanded',
      String(
        !open,
      ),
    );

    nav?.classList.toggle(
      'is-open',
      !open,
    );
  },
);

nav
  ?.querySelectorAll(
    'a',
  )
  .forEach(
    (
      link,
    ) => {
      link.addEventListener(
        'click',
        () => {
          nav.classList.remove(
            'is-open',
          );

          toggle?.setAttribute(
            'aria-expanded',
            'false',
          );
        },
      );
    },
  );

document
  .querySelectorAll(
    '[data-year]',
  )
  .forEach(
    (
      node,
    ) => {
      node.textContent =
        String(
          new Date()
            .getFullYear(),
        );
    },
  );

const revealNodes = [
  ...document.querySelectorAll(
    '.reveal',
  ),
];

if (
  'IntersectionObserver'
  in window
) {
  const observer =
    new IntersectionObserver(
      (
        entries,
      ) => {
        for (
          const entry of
          entries
        ) {
          if (
            !entry
              .isIntersecting
          ) {
            continue;
          }

          entry
            .target
            .classList
            .add(
              'is-visible',
            );

          observer.unobserve(
            entry.target,
          );
        }
      },

      {
        threshold:
          0.14,
      },
    );

  revealNodes.forEach(
    (
      node,
    ) =>
      observer.observe(
        node,
      ),
  );
} else {
  revealNodes.forEach(
    (
      node,
    ) =>
      node
        .classList
        .add(
          'is-visible',
        ),
  );
}
`;

  return [
    {
      path:
        'index.html',

      content:
        indexHtml,
    },

    {
      path:
        'styles.css',

      content:
        stylesCss,
    },

    {
      path:
        'script.js',

      content:
        scriptJs,
    },
  ];
}
