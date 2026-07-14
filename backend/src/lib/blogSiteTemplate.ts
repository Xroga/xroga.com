/**
 * High-quality deterministic blog/site templates used when LLM output is empty
 * or the old generic "Fast / Modern / Reliable" Xroga stub would otherwise ship.
 * Users must see a real blog structure — never prompt text dumped into an H1.
 */

export interface SiteFiles {
  html: string;
  css: string;
  js: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function topicFromPrompt(prompt: string): { brand: string; topic: string; tagline: string; posts: Array<{ title: string; excerpt: string; tag: string }> } {
  const raw = prompt.replace(/\[Previous conversation[\s\S]*?\[Current message\]\s*/i, '').trim();
  const lower = raw.toLowerCase();

  let topic = 'Ideas';
  if (/\bai\b|artificial intelligence|machine learning|llm\b/.test(lower)) topic = 'AI';
  else if (/\btech|software|coding|developer\b/.test(lower)) topic = 'Tech';
  else if (/\btravel|adventure\b/.test(lower)) topic = 'Travel';
  else if (/\bfood|recipe|cook\b/.test(lower)) topic = 'Food';
  else if (/\bfitness|health|wellness\b/.test(lower)) topic = 'Wellness';
  else if (/\bdesign|ui|ux\b/.test(lower)) topic = 'Design';
  else if (/\bcrypto|web3|blockchain\b/.test(lower)) topic = 'Crypto';
  else if (/\bblog\b/.test(lower)) topic = 'Blog';

  const brand =
    topic === 'AI'
      ? 'Signal & Synapse'
      : topic === 'Tech'
        ? 'Compile Daily'
        : topic === 'Travel'
          ? 'Far Orbit'
          : `${topic} Journal`;

  const tagline =
    topic === 'AI'
      ? 'Clear writing on models, tools, and building with intelligence.'
      : `Stories, notes, and field reports from ${topic.toLowerCase()}.`;

  const posts =
    topic === 'AI'
      ? [
          {
            title: 'What “simple AI products” get wrong',
            excerpt:
              'Most demos impress for 10 seconds. Durable tools win on latency, cost, and honest UX — here’s a practical checklist.',
            tag: 'Product',
          },
          {
            title: 'A beginner map of LLMs in 2026',
            excerpt:
              'Models, embeddings, and tool-use — explained without jargon so you can pick a stack for your first app.',
            tag: 'Guide',
          },
          {
            title: 'Prompting that ships code (not essays)',
            excerpt:
              'How to constrain models to return files, tests, and previews — the same discipline Xroga uses on builds.',
            tag: 'Builders',
          },
        ]
      : [
          {
            title: `Starting a ${topic.toLowerCase()} blog that people finish`,
            excerpt: 'Structure, rhythm, and a home page that sets expectations in under 8 seconds.',
            tag: 'Craft',
          },
          {
            title: 'Three posts you should publish first',
            excerpt: 'A starter cadence: one how-to, one opinion, one field note — enough to look alive.',
            tag: 'Playbook',
          },
          {
            title: 'Design notes for a calm reading site',
            excerpt: 'Typography, margins, and mobile spacing that make long articles feel easy.',
            tag: 'Design',
          },
        ];

  return { brand, topic, tagline, posts };
}

/** True when HTML/CSS is the old boring Xroga stub users screenshot. */
export function looksLikeGenericFallbackSite(html: string, css = ''): boolean {
  const blob = `${html}\n${css}`;
  if (/Lightning-fast performance/i.test(blob) && /Zero-defect/i.test(blob)) return true;
  if (/Built by Xroga AI Swarm/i.test(blob)) return true;
  if (/Ready to begin\?/i.test(blob) && /Contact Us/i.test(blob)) return true;
  if (/Get Started/i.test(html) && /Xroga/i.test(html) && /Fast<\/h3>/i.test(html)) return true;
  // Truncated prompt dumped as hero title
  if (/<h1[^>]*>\s*Build a simple blog/i.test(html)) return true;
  if (/linear-gradient\(135deg,\s*#7c3aed/i.test(css || blob) && /Zero-defect|Lightning-fast/i.test(blob)) {
    return true;
  }
  // Tiny stub masquerading as a site (no blog structure)
  if (html.length < 1200 && !/post-card|article|blog/i.test(html) && /btn-primary/i.test(html)) {
    return true;
  }
  return false;
}

/** Real blog website — used for simple_static / Escape Pod / Claude failure. */
export function generateQualityBlogSite(prompt: string): SiteFiles {
  const { brand, topic, tagline, posts } = topicFromPrompt(prompt);
  const year = new Date().getFullYear();
  const brandEsc = escapeHtml(brand);
  const topicEsc = escapeHtml(topic);
  const taglineEsc = escapeHtml(tagline);

  const postCards = posts
    .map(
      (p, i) => `
      <article class="post-card" data-tag="${escapeHtml(p.tag)}">
        <div class="post-meta"><span class="tag">${escapeHtml(p.tag)}</span><time>July ${10 + i}, ${year}</time></div>
        <h3><a href="#post-${i + 1}">${escapeHtml(p.title)}</a></h3>
        <p>${escapeHtml(p.excerpt)}</p>
        <a class="read-more" href="#post-${i + 1}">Read article →</a>
      </article>`
    )
    .join('\n');

  const postPages = posts
    .map(
      (p, i) => `
    <article id="post-${i + 1}" class="post-full hidden">
      <button type="button" class="back-link" data-back>← Back to posts</button>
      <div class="post-meta"><span class="tag">${escapeHtml(p.tag)}</span><time>July ${10 + i}, ${year}</time></div>
      <h1>${escapeHtml(p.title)}</h1>
      <p class="lead">${escapeHtml(p.excerpt)}</p>
      <p>This is a working starter article for your ${topicEsc} blog. Replace this copy with your own voice — the layout, typography, and navigation are already production-ready.</p>
      <p>Use the “Write a post” form on the home page to add notes locally in this browser (saved with <code>localStorage</code>).</p>
    </article>`
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${taglineEsc}" />
  <title>${brandEsc} — ${topicEsc} Blog</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="brand" href="#home" data-home>${brandEsc}</a>
      <button type="button" class="nav-toggle" aria-label="Open menu" aria-expanded="false">☰</button>
      <nav class="site-nav" id="site-nav">
        <a href="#home" data-home>Home</a>
        <a href="#posts">Posts</a>
        <a href="#about">About</a>
        <a href="#write">Write</a>
      </nav>
    </div>
  </header>

  <main id="main">
    <section id="home" class="hero wrap">
      <p class="eyebrow">${topicEsc} Blog</p>
      <h1>Write clearly about ${topicEsc}</h1>
      <p class="hero-lead">${taglineEsc}</p>
      <div class="hero-actions">
        <a class="btn primary" href="#posts">Browse posts</a>
        <a class="btn ghost" href="#write">Start writing</a>
      </div>
    </section>

    <section id="posts" class="wrap section">
      <div class="section-head">
        <h2>Latest posts</h2>
        <p>Three starter pieces — edit or replace anytime.</p>
      </div>
      <div class="post-grid" id="post-grid">
        ${postCards}
      </div>
      <div id="user-posts" class="post-grid"></div>
    </section>

    <div id="article-view" class="wrap section">
      ${postPages}
    </div>

    <section id="about" class="wrap section about">
      <h2>About ${brandEsc}</h2>
      <p>A clean, mobile-first blog template for ${topicEsc.toLowerCase()} writers. Built so you can publish immediately — then connect GitHub/Vercel when you want a public URL.</p>
    </section>

    <section id="write" class="wrap section write">
      <h2>Write a post</h2>
      <p class="hint">Saved in this browser only (demo). Great for testing the UI.</p>
      <form id="post-form" class="post-form">
        <label>Title<input name="title" required maxlength="120" placeholder="My first ${topicEsc} note" /></label>
        <label>Body<textarea name="body" required rows="5" placeholder="What did you learn today?"></textarea></label>
        <button type="submit" class="btn primary">Publish locally</button>
      </form>
    </section>
  </main>

  <footer class="site-footer">
    <div class="wrap footer-inner">
      <span>© ${year} ${brandEsc}</span>
      <span>Simple ${topicEsc} blog — ready to customize</span>
    </div>
  </footer>
  <script src="script.js"></script>
</body>
</html>`;

  const css = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,700&family=Source+Sans+3:wght@400;600;700&display=swap');

:root {
  --bg: #f6f1e8;
  --ink: #1c1914;
  --muted: #5c5346;
  --card: #fffdf8;
  --line: rgba(28, 25, 20, 0.12);
  --accent: #0f6b5c;
  --accent-2: #c45c26;
  --shadow: 0 18px 40px rgba(28, 25, 20, 0.08);
  --radius: 18px;
  --max: 1080px;
}

*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  color: var(--ink);
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(15, 107, 92, 0.12), transparent 55%),
    radial-gradient(900px 500px at 100% 0%, rgba(196, 92, 38, 0.12), transparent 50%),
    var(--bg);
  line-height: 1.65;
}
h1, h2, h3, .brand {
  font-family: Fraunces, Georgia, serif;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 3px; }
a:hover { color: var(--accent-2); }
.skip {
  position: absolute; left: -999px; top: 0; background: var(--ink); color: #fff; padding: 0.5rem 1rem;
}
.skip:focus { left: 0.5rem; top: 0.5rem; z-index: 100; }
.wrap { width: min(var(--max), calc(100% - 2rem)); margin-inline: auto; }
.site-header {
  position: sticky; top: 0; z-index: 40;
  backdrop-filter: blur(12px);
  background: rgba(246, 241, 232, 0.88);
  border-bottom: 1px solid var(--line);
}
.header-inner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; min-height: 4rem;
}
.brand { font-size: 1.25rem; color: var(--ink); text-decoration: none; }
.site-nav { display: flex; gap: 1.25rem; align-items: center; }
.site-nav a { color: var(--muted); text-decoration: none; font-weight: 600; font-size: 0.95rem; }
.site-nav a:hover { color: var(--ink); }
.nav-toggle {
  display: none; border: 1px solid var(--line); background: var(--card);
  border-radius: 10px; padding: 0.4rem 0.7rem; cursor: pointer;
}
.hero { padding: 4.5rem 0 3rem; }
.eyebrow {
  display: inline-flex; margin: 0 0 0.75rem;
  padding: 0.25rem 0.7rem; border-radius: 999px;
  background: rgba(15, 107, 92, 0.1); color: var(--accent);
  font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
}
.hero h1 { font-size: clamp(2.4rem, 5vw, 3.6rem); max-width: 14ch; margin: 0 0 1rem; }
.hero-lead { max-width: 38rem; font-size: 1.15rem; color: var(--muted); margin: 0 0 1.75rem; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.8rem 1.25rem; border-radius: 999px; font-weight: 700;
  border: 1px solid transparent; cursor: pointer; text-decoration: none;
}
.btn.primary { background: var(--ink); color: #fff; }
.btn.primary:hover { background: var(--accent); color: #fff; }
.btn.ghost { background: transparent; border-color: var(--line); color: var(--ink); }
.section { padding: 2.5rem 0 1rem; }
.section-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 0.75rem; margin-bottom: 1.5rem; }
.section-head h2 { margin: 0; font-size: 1.8rem; }
.section-head p { margin: 0; color: var(--muted); }
.post-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem;
}
.post-card, .post-full, .about, .write, .post-form {
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.post-card { padding: 1.35rem 1.35rem 1.2rem; display: flex; flex-direction: column; gap: 0.65rem; }
.post-card h3 { margin: 0; font-size: 1.25rem; }
.post-card h3 a { color: inherit; text-decoration: none; }
.post-card h3 a:hover { color: var(--accent); }
.post-card p { margin: 0; color: var(--muted); flex: 1; }
.post-meta { display: flex; gap: 0.75rem; align-items: center; font-size: 0.8rem; color: var(--muted); }
.tag {
  display: inline-flex; padding: 0.15rem 0.55rem; border-radius: 999px;
  background: rgba(196, 92, 38, 0.12); color: var(--accent-2); font-weight: 700;
}
.read-more { font-weight: 700; text-decoration: none; }
.post-full { padding: 2rem; margin-bottom: 2rem; }
.post-full.hidden { display: none; }
.post-full h1 { margin: 0.5rem 0 1rem; font-size: clamp(1.8rem, 3vw, 2.4rem); }
.lead { font-size: 1.15rem; color: var(--muted); }
.back-link {
  border: 0; background: transparent; color: var(--accent); font-weight: 700;
  padding: 0; cursor: pointer; margin-bottom: 1rem;
}
.about, .write { padding: 1.75rem; margin-bottom: 2rem; }
.post-form { display: grid; gap: 0.9rem; padding: 0; border: 0; box-shadow: none; background: transparent; }
.post-form label { display: grid; gap: 0.35rem; font-weight: 600; font-size: 0.92rem; }
.post-form input, .post-form textarea {
  width: 100%; border: 1px solid var(--line); border-radius: 12px;
  padding: 0.75rem 0.9rem; font: inherit; background: #fff;
}
.hint { color: var(--muted); margin-top: -0.5rem; }
.site-footer { border-top: 1px solid var(--line); margin-top: 2rem; }
.footer-inner {
  display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  padding: 1.5rem 0; color: var(--muted); font-size: 0.9rem;
}

@media (max-width: 900px) {
  .post-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 720px) {
  .nav-toggle { display: inline-flex; }
  .site-nav {
    display: none; position: absolute; right: 1rem; top: 4rem;
    flex-direction: column; align-items: stretch; gap: 0.25rem;
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    padding: 0.75rem; min-width: 180px; box-shadow: var(--shadow);
  }
  .site-nav.open { display: flex; }
  .post-grid { grid-template-columns: 1fr; }
  .hero { padding-top: 3rem; }
}`;

  const js = `(() => {
  const nav = document.getElementById('site-nav');
  const toggle = document.querySelector('.nav-toggle');
  const grid = document.getElementById('user-posts');
  const form = document.getElementById('post-form');
  const KEY = 'xroga-blog-posts-v1';

  toggle?.addEventListener('click', () => {
    const open = nav?.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  function showHome() {
    document.querySelectorAll('.post-full').forEach((el) => el.classList.add('hidden'));
    document.getElementById('posts')?.scrollIntoView({ behavior: 'smooth' });
  }

  document.querySelectorAll('[data-home]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    showHome();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

  document.querySelectorAll('a[href^="#post-"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href')?.slice(1);
      if (!id) return;
      e.preventDefault();
      document.querySelectorAll('.post-full').forEach((el) => el.classList.add('hidden'));
      document.getElementById(id)?.classList.remove('hidden');
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', showHome);
  });

  function loadPosts() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  }
  function savePosts(posts) {
    localStorage.setItem(KEY, JSON.stringify(posts));
  }
  function renderUserPosts() {
    if (!grid) return;
    const posts = loadPosts();
    grid.innerHTML = posts.map((p, i) => \`
      <article class="post-card">
        <div class="post-meta"><span class="tag">Yours</span><time>\${p.date}</time></div>
        <h3>\${p.title}</h3>
        <p>\${p.body}</p>
        <button type="button" class="read-more" data-del="\${i}">Delete</button>
      </article>\`).join('');
    grid.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-del'));
        const next = loadPosts().filter((_, i) => i !== idx);
        savePosts(next);
        renderUserPosts();
      });
    });
  }

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const body = String(fd.get('body') || '').trim();
    if (!title || !body) return;
    const posts = loadPosts();
    posts.unshift({ title, body, date: new Date().toLocaleDateString() });
    savePosts(posts);
    form.reset();
    renderUserPosts();
    document.getElementById('posts')?.scrollIntoView({ behavior: 'smooth' });
  });

  renderUserPosts();
})();`;

  return { html, css, js };
}
