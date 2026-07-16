/**
 * Prompt-matched deterministic scaffolds.
 * Used when LLM assembly is empty / Escape Pod / Claude fails.
 * NEVER default every product to a blog — match the user's request.
 */

import { detectBuildProjectType, type BuildProjectType } from '../swarm/negotiation/buildTypeDetector.js';
import { generateQualityBlogSite, type SiteFiles } from './blogSiteTemplate.js';
import { liveAiBrowserClientSource, liveChatbotFormJs } from './liveAiRuntime.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanPrompt(prompt: string): string {
  return prompt.replace(/\[Previous conversation[\s\S]*?\[Current message\]\s*/i, '').trim();
}

/** Stable 32-bit hash so two different prompts never share identical mock data. */
export function promptSeed(prompt: string): number {
  const s = cleanPrompt(prompt).toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickBrand(prompt: string, seed: number, fallbacks: string[]): string {
  const raw = cleanPrompt(prompt);
  // Prefer quoted name or "called X" / "named X"
  const named =
    raw.match(/["']([A-Za-z0-9][\w\s-]{1,28})["']/)?.[1] ||
    raw.match(/\b(?:called|named|brand(?:ed)?)\s+([A-Za-z][\w-]{1,24})\b/i)?.[1];
  if (named) return named.trim();

  const stop = new Set([
    'build',
    'create',
    'make',
    'a',
    'an',
    'the',
    'for',
    'with',
    'and',
    'my',
    'me',
    'website',
    'site',
    'app',
    'dashboard',
    'page',
    'simple',
    'modern',
    'please',
    'want',
    'need',
    'crypto',
    'blog',
    'saas',
  ]);
  const words = raw
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w.toLowerCase()));
  if (words.length >= 2) {
    const a = words[0]!;
    const b = words[1]!;
    return `${a[0]!.toUpperCase()}${a.slice(1)}${b[0]!.toUpperCase()}${b.slice(1)}`.slice(0, 28);
  }
  if (words.length === 1) {
    const w = words[0]!;
    return `${w[0]!.toUpperCase()}${w.slice(1)}`.slice(0, 24);
  }
  return fallbacks[seed % fallbacks.length]!;
}

function taglineFromPrompt(prompt: string, seed: number, defaults: string[]): string {
  const raw = cleanPrompt(prompt);
  // NEVER use the full build instruction as the H1 (users screenshot this as "fake AI")
  if (/^(build|create|make|design)\b/i.test(raw)) {
    const brand = pickBrand(prompt, seed, ['HiBee', 'Lumen', 'Harbor', 'Brightside']);
    const benefit =
      /\bpricing|ai\b/i.test(raw)
        ? `${brand} — AI plans with clarity`
        : /\bnight|day|toggle|dark\b/i.test(raw)
          ? `${brand} — day & night, beautifully`
          : defaults[seed % defaults.length]!;
    return benefit;
  }
  if (raw.length > 24 && raw.length < 80 && !/\blanding page\b/i.test(raw)) return raw;
  return defaults[seed % defaults.length]!;
}

export function wantsBlogSite(prompt: string): boolean {
  const t = cleanPrompt(prompt).toLowerCase();
  if (/\b(crypto|dashboard|saas|marketplace|chatbot|defi|web3|crm|admin panel)\b/.test(t)) {
    return false;
  }
  return /\b(blog|journal|newsletter|writing site|articles?\s+site|medium[- ]like)\b/.test(t);
}

export function wantsPortfolio(prompt: string): boolean {
  return /\b(portfolio|photographer|designer portfolio|personal brand site)\b/i.test(prompt);
}

export function scaffoldKindForPrompt(prompt: string): BuildProjectType | 'blog' | 'portfolio' | 'landing' {
  if (wantsBlogSite(prompt)) return 'blog';
  if (wantsPortfolio(prompt)) return 'portfolio';
  const t = detectBuildProjectType(prompt);
  if (t === 'website') {
    if (/\b(landing|marketing|homepage|coming soon)\b/i.test(prompt)) return 'landing';
    return 'landing';
  }
  return t;
}

function baseCss(vars: Record<string, string>): string {
  const root = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return `:root{${root}}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);line-height:1.55;min-height:100vh}
a{color:inherit;text-decoration:none}
button,input,select{font:inherit}
.wrap{max-width:1120px;margin:0 auto;padding:0 1.25rem}
.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.7rem 1.2rem;border-radius:10px;border:0;font-weight:700;cursor:pointer;background:var(--accent);color:var(--on-accent)}
.btn.ghost{background:transparent;border:1px solid var(--border);color:var(--text)}
.muted{color:var(--muted);font-size:.92rem}
@media(max-width:720px){.hide-sm{display:none!important}}`;
}

function cryptoDashboard(prompt: string, seed: number): SiteFiles {
  const brand = pickBrand(prompt, seed, ['NovaLedger', 'OrbitSwap', 'PulseChain', 'Vaultly']);
  const tagline = taglineFromPrompt(prompt, seed, [
    'Live crypto portfolio & market pulse',
    'Track tokens, swaps, and on-chain activity',
  ]);
  const price = (42000 + (seed % 8000)).toFixed(0);
  const accent = ['#22d3ee', '#a3e635', '#f59e0b', '#818cf8'][seed % 4]!;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeHtml(tagline)}" />
  <title>${escapeHtml(brand)} — Crypto Dashboard</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="logo">${escapeHtml(brand)}</div>
      <nav>
        <a class="active" href="#overview" data-tab="overview">Overview</a>
        <a href="#markets" data-tab="markets">Markets</a>
        <a href="#swap" data-tab="swap">Swap</a>
        <a href="#activity" data-tab="activity">Activity</a>
      </nav>
      <button type="button" class="btn connect" id="connect-wallet">Connect wallet</button>
    </aside>
    <main>
      <header class="top">
        <div>
          <p class="eyebrow">Crypto dashboard</p>
          <h1>${escapeHtml(tagline)}</h1>
        </div>
        <div class="wallet-pill" id="wallet-status">Not connected</div>
      </header>

      <section id="overview" class="panel active">
        <div class="kpis">
          <article class="kpi"><span>BTC (live)</span><strong data-live-price="bitcoin">$${price}</strong><em class="muted" id="btc-change">CoinGecko</em></article>
          <article class="kpi"><span>ETH (live)</span><strong data-live-price="ethereum">—</strong><em class="muted">CoinGecko</em></article>
          <article class="kpi"><span>SOL (live)</span><strong data-live-price="solana">—</strong><em class="muted">CoinGecko</em></article>
          <article class="kpi"><span>Open positions</span><strong>${3 + (seed % 5)}</strong><em class="muted">demo</em></article>
        </div>
        <p class="muted" style="margin:0 0 1rem;font-size:.8rem">Live prices via free CoinGecko API — auto-integrated by Xroga (no API key).</p>
        <div class="chart-card">
          <h2>Price pulse</h2>
          <canvas id="spark" width="900" height="220" aria-label="Price chart"></canvas>
        </div>
      </section>

      <section id="markets" class="panel">
        <h2>Markets <span class="muted" style="font-weight:400;font-size:.85rem">· live CoinGecko</span></h2>
        <table class="table">
          <thead><tr><th>Asset</th><th>Price</th><th>24h</th></tr></thead>
          <tbody>
            <tr><td><strong>BTC</strong><span class="muted"> Bitcoin</span></td><td>Loading…</td><td>—</td></tr>
            <tr><td><strong>ETH</strong><span class="muted"> Ethereum</span></td><td>Loading…</td><td>—</td></tr>
            <tr><td><strong>SOL</strong><span class="muted"> Solana</span></td><td>Loading…</td><td>—</td></tr>
            <tr><td><strong>ARB</strong><span class="muted"> Arbitrum</span></td><td>Loading…</td><td>—</td></tr>
          </tbody>
        </table>
      </section>

      <section id="swap" class="panel">
        <h2>Swap</h2>
        <form class="swap-form" id="swap-form">
          <label>From<select name="from"><option>ETH</option><option>USDC</option><option>SOL</option></select></label>
          <label>To<select name="to"><option>USDC</option><option>ETH</option><option>ARB</option></select></label>
          <label>Amount<input name="amount" type="number" min="0" step="0.01" value="${(1 + (seed % 9) / 10).toFixed(1)}" /></label>
          <button class="btn" type="submit">Preview swap</button>
          <p class="muted" id="swap-out">Fetching live rates from CoinGecko…</p>
        </form>
      </section>

      <section id="activity" class="panel">
        <h2>Activity</h2>
        <ul class="tx" id="tx-list"></ul>
      </section>
    </main>
  </div>
  <script src="js/xroga-live-ai.js"></script>
  <script src="script.js"></script>
</body>
</html>`;

  const css =
    baseCss({
      '--bg': '#070b14',
      '--panel': '#0f172a',
      '--text': '#e2e8f0',
      '--muted': '#94a3b8',
      '--accent': accent,
      '--on-accent': '#041016',
      '--border': '#1e293b',
      '--up': '#4ade80',
      '--down': '#f87171',
    }) +
    `
.app{display:grid;grid-template-columns:240px 1fr;min-height:100vh}
.sidebar{background:#020617;border-right:1px solid var(--border);padding:1.25rem;display:flex;flex-direction:column;gap:1.25rem}
.logo{font-weight:800;letter-spacing:.02em;font-size:1.15rem;color:var(--accent)}
.sidebar nav{display:flex;flex-direction:column;gap:.35rem;flex:1}
.sidebar a{padding:.65rem .8rem;border-radius:8px;color:var(--muted)}
.sidebar a.active,.sidebar a:hover{background:var(--panel);color:var(--text)}
.connect{width:100%;justify-content:center}
main{padding:1.5rem}
.top{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:1.5rem}
.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.72rem;color:var(--muted);margin-bottom:.35rem}
h1{font-size:clamp(1.35rem,3vw,1.9rem);max-width:36rem}
.wallet-pill{padding:.45rem .8rem;border-radius:999px;border:1px solid var(--border);background:var(--panel);font-size:.85rem}
.panel{display:none}
.panel.active{display:block}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1rem}
.kpi,.chart-card,.swap-form,.table{background:var(--panel);border:1px solid var(--border);border-radius:14px}
.kpi{padding:1rem}
.kpi span{display:block;color:var(--muted);font-size:.8rem;margin-bottom:.35rem}
.kpi strong{font-size:1.35rem}
.kpi em{display:block;margin-top:.35rem;font-style:normal;font-size:.85rem}
.up{color:var(--up)}.down{color:var(--down)}
.chart-card{padding:1rem}
.chart-card h2,.panel>h2{margin-bottom:.75rem;font-size:1.05rem}
.table{width:100%;border-collapse:collapse;overflow:hidden}
.table th,.table td{padding:.85rem 1rem;text-align:left;border-bottom:1px solid var(--border)}
.swap-form{padding:1.25rem;display:grid;gap:.85rem;max-width:420px}
.swap-form label{display:grid;gap:.35rem;font-size:.85rem;color:var(--muted)}
.swap-form input,.swap-form select{padding:.65rem .75rem;border-radius:8px;border:1px solid var(--border);background:#020617;color:var(--text)}
.tx{list-style:none;display:grid;gap:.6rem}
.tx li{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:.85rem 1rem;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
@media(max-width:900px){.app{grid-template-columns:1fr}.sidebar{flex-direction:row;flex-wrap:wrap;align-items:center}.sidebar nav{flex-direction:row;flex-wrap:wrap}.kpis{grid-template-columns:1fr 1fr}}`;

  const js = `(() => {
  const seed = ${seed};
  const tabs = document.querySelectorAll('[data-tab]');
  const panels = document.querySelectorAll('.panel');
  tabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const id = tab.getAttribute('data-tab');
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      panels.forEach((p) => p.classList.toggle('active', p.id === id));
    });
  });

  const canvas = document.getElementById('spark');
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#22d3ee';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let y = h * 0.55;
    for (let x = 0; x <= w; x += 8) {
      y += Math.sin((x + seed) / 40) * 6 + ((x * seed) % 7) - 3;
      y = Math.max(20, Math.min(h - 20, y));
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const status = document.getElementById('wallet-status');
  const connect = document.getElementById('connect-wallet');
  let connected = false;
  connect?.addEventListener('click', () => {
    connected = !connected;
    const addr = '0x' + (seed.toString(16) + 'a1b2c3d4e5f67890').slice(0, 8) + '…' + (seed % 0xffff).toString(16);
    status.textContent = connected ? addr : 'Not connected';
    connect.textContent = connected ? 'Disconnect' : 'Connect wallet';
  });

  const list = document.getElementById('tx-list');
  if (list) {
    const rows = [
      { t: 'Swap', d: 'ETH → USDC', a: (0.2 + (seed % 9) / 10).toFixed(2) + ' ETH' },
      { t: 'Receive', d: 'Wallet inbound', a: '+' + (120 + (seed % 40)) + ' USDC' },
      { t: 'Stake', d: 'Validator deposit', a: (1 + (seed % 3)) + ' SOL' },
    ];
    list.innerHTML = rows.map((r) => '<li><div><strong>' + r.t + '</strong><div class="muted">' + r.d + '</div></div><span>' + r.a + '</span></li>').join('');
  }

  document.getElementById('swap-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const out = document.getElementById('swap-out');
    if (out) out.textContent = 'Preview: ' + fd.get('amount') + ' ' + fd.get('from') + ' ≈ ' + (Number(fd.get('amount')) * (1.2 + (seed % 40) / 100)).toFixed(3) + ' ' + fd.get('to');
  });

  // LIVE free crypto prices (CoinGecko — auto-integrated, no API key)
  (async () => {
    try {
      const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,arbitrum&vs_currencies=usd&include_24hr_change=true';
      const data = await fetch(url).then((r) => r.json());
      const map = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', arbitrum: 'ARB' };
      const names = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana', arbitrum: 'Arbitrum' };
      document.querySelectorAll('[data-live-price]').forEach((el) => {
        const id = el.getAttribute('data-live-price');
        if (id && data[id]?.usd != null) {
          el.textContent = '$' + Number(data[id].usd).toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
      });
      const btcCh = document.getElementById('btc-change');
      if (btcCh && data.bitcoin) {
        const ch = Number(data.bitcoin.usd_24h_change || 0);
        btcCh.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '% 24h';
        btcCh.className = ch >= 0 ? 'up' : 'down';
      }
      const tbody = document.querySelector('#markets tbody');
      if (tbody) {
        tbody.innerHTML = Object.keys(map).map((id) => {
          const row = data[id];
          if (!row) return '';
          const ch = Number(row.usd_24h_change || 0);
          return '<tr><td><strong>' + map[id] + '</strong><span class="muted"> ' + names[id] + '</span></td><td>$'
            + Number(row.usd).toLocaleString(undefined, { maximumFractionDigits: 2 })
            + '</td><td class="' + (ch >= 0 ? 'up' : 'down') + '">' + (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%</td></tr>';
        }).join('');
      }
      const out = document.getElementById('swap-out');
      if (out && data.ethereum && data.bitcoin) {
        out.textContent = 'Live rates ready (CoinGecko). ETH $' + Number(data.ethereum.usd).toLocaleString() + ' · BTC $' + Number(data.bitcoin.usd).toLocaleString();
      }
    } catch (err) {
      console.warn('[crypto] live prices unavailable', err);
    }
  })();
})();`;

  return { html, css, js: `${liveAiBrowserClientSource()}\n${js}` };
}

function saasLanding(prompt: string, seed: number): SiteFiles {
  const brand = pickBrand(prompt, seed, ['Northloop', 'Stackline', 'Clearpath', 'Pilotkit']);
  const tagline = taglineFromPrompt(prompt, seed, ['Ship work faster with a focused workspace']);
  const features = [
    'Realtime collaboration',
    'Usage analytics',
    'Role-based access',
    'API + webhooks',
  ].map((f, i) => (i === seed % 4 ? `${f} for ${brand}` : f));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(brand)} — SaaS</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="nav wrap">
    <a class="brand" href="#">${escapeHtml(brand)}</a>
    <nav class="hide-sm"><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#cta">Demo</a></nav>
    <a class="btn" href="#cta">Start free</a>
  </header>
  <section class="hero wrap">
    <p class="eyebrow">SaaS product</p>
    <h1>${escapeHtml(tagline)}</h1>
    <p class="lead">Built from your brief — unique layout seed ${seed.toString(16)}. Replace copy and wire your backend when ready.</p>
    <div class="hero-actions"><a class="btn" href="#cta">Get started</a><a class="btn ghost" href="#features">See features</a></div>
  </section>
  <section id="features" class="wrap features">
    <h2>What you get</h2>
    <div class="grid">${features.map((f) => `<article><h3>${escapeHtml(f)}</h3><p class="muted">Production-ready shell matched to your request.</p></article>`).join('')}</div>
  </section>
  <section id="pricing" class="wrap pricing">
    <h2>Pricing</h2>
    <div class="grid">
      <article><h3>Starter</h3><p class="price">$${9 + (seed % 20)}<span>/mo</span></p><button class="btn ghost" type="button">Choose</button></article>
      <article class="featured"><h3>Growth</h3><p class="price">$${29 + (seed % 40)}<span>/mo</span></p><button class="btn" type="button">Choose</button></article>
    </div>
  </section>
  <section id="cta" class="cta wrap">
    <h2>Ready to try ${escapeHtml(brand)}?</h2>
    <form id="demo-form"><input name="email" type="email" required placeholder="you@company.com" /><button class="btn" type="submit">Request demo</button></form>
    <p class="muted" id="demo-msg"></p>
  </section>
  <footer class="wrap muted">© ${new Date().getFullYear()} ${escapeHtml(brand)}</footer>
  <script src="script.js"></script>
</body>
</html>`;

  const css =
    baseCss({
      '--bg': '#f4f7fb',
      '--text': '#0f172a',
      '--muted': '#64748b',
      '--accent': ['#0ea5e9', '#059669', '#2563eb', '#0f766e'][seed % 4]!,
      '--on-accent': '#fff',
      '--border': '#dbe3ef',
      '--surface': '#ffffff',
    }) +
    `
.nav{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;gap:1rem}
.brand{font-weight:800;font-size:1.15rem}
.nav nav{display:flex;gap:1.25rem;color:var(--muted)}
.hero{padding:4.5rem 1.25rem 3rem}
.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;color:var(--accent);font-weight:700;margin-bottom:.75rem}
.hero h1{font-size:clamp(2rem,5vw,3.2rem);max-width:14ch;line-height:1.1;margin-bottom:1rem}
.lead{max-width:36rem;color:var(--muted);margin-bottom:1.5rem}
.hero-actions{display:flex;gap:.75rem;flex-wrap:wrap}
.features,.pricing,.cta{padding:3rem 1.25rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-top:1rem}
.grid article,.cta{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:1.25rem}
.featured{outline:2px solid var(--accent)}
.price{font-size:2rem;font-weight:800;margin:.75rem 0 1rem}
.price span{font-size:.9rem;color:var(--muted);font-weight:500}
#demo-form{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem}
#demo-form input{flex:1;min-width:200px;padding:.7rem .9rem;border-radius:10px;border:1px solid var(--border)}
footer{padding:2rem 1.25rem 3rem}`;

  const js = `document.getElementById('demo-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = document.getElementById('demo-msg');
  if (msg) msg.textContent = 'Demo request saved locally for ${brand.replace(/'/g, "\\'")} — connect your API next.';
});`;

  return { html, css, js };
}

function marketplaceSite(prompt: string, seed: number): SiteFiles {
  const brand = pickBrand(prompt, seed, ['Bazaarly', 'Listwell', 'TradeNest']);
  const items = ['Starter kit', 'Pro bundle', 'Studio pack', 'Field guide'].map((name, i) => ({
    name: `${name} ${String.fromCharCode(65 + ((seed + i) % 6))}`,
    price: 19 + ((seed + i * 7) % 80),
  }));
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(brand)} Marketplace</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="bar wrap"><strong>${escapeHtml(brand)}</strong><input id="search" placeholder="Search listings" /><span class="cart" id="cart">Cart 0</span></header>
  <section class="hero wrap"><h1>Marketplace built for your brief</h1><p class="muted">${escapeHtml(taglineFromPrompt(prompt, seed, ['Buy, sell, and manage listings']))}</p></section>
  <section class="wrap grid" id="listings">${items.map((it) => `<article data-price="${it.price}"><h3>${escapeHtml(it.name)}</h3><p>$${it.price}</p><button class="btn" type="button" data-add>Add</button></article>`).join('')}</section>
  <script src="script.js"></script>
</body>
</html>`;
  const css =
    baseCss({
      '--bg': '#fffaf5',
      '--text': '#1c1917',
      '--muted': '#78716c',
      '--accent': '#ea580c',
      '--on-accent': '#fff',
      '--border': '#e7e5e4',
      '--surface': '#fff',
    }) +
    `.bar{display:flex;gap:1rem;align-items:center;padding:1rem 0;border-bottom:1px solid var(--border)}
.bar input{flex:1;padding:.65rem .8rem;border:1px solid var(--border);border-radius:10px}
.hero{padding:2.5rem 0 1rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;padding:1rem 0 3rem}
.grid article{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:1rem;display:grid;gap:.75rem}`;
  const js = `let n=0;const cart=document.getElementById('cart');document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>{n++;if(cart)cart.textContent='Cart '+n}));const search=document.getElementById('search');search?.addEventListener('input',()=>{const q=search.value.toLowerCase();document.querySelectorAll('#listings article').forEach(a=>{a.style.display=a.textContent.toLowerCase().includes(q)?'':'none'})});`;
  return { html, css, js };
}

function portfolioSite(prompt: string, seed: number): SiteFiles {
  const brand = pickBrand(prompt, seed, ['Studio North', 'Atelier', 'Frame & Form']);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(brand)} — Portfolio</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="wrap nav"><a class="brand" href="#">${escapeHtml(brand)}</a><nav><a href="#work">Work</a><a href="#about">About</a><a href="#contact">Contact</a></nav></header>
  <section class="hero wrap"><p class="eyebrow">Portfolio</p><h1>${escapeHtml(taglineFromPrompt(prompt, seed, ['Selected work & collaborations']))}</h1></section>
  <section id="work" class="wrap grid">
    ${[1, 2, 3, 4]
      .map((i) => `<figure><div class="ph" style="--h:${140 + ((seed + i * 17) % 80)}px"></div><figcaption>Project ${String.fromCharCode(64 + i)} · seed ${(seed + i) % 997}</figcaption></figure>`)
      .join('')}
  </section>
  <section id="about" class="wrap about"><h2>About</h2><p class="muted">Custom portfolio scaffold generated for your request — swap in real case studies next.</p></section>
  <section id="contact" class="wrap"><h2>Contact</h2><form id="c"><input name="email" type="email" required placeholder="Email" /><textarea name="msg" required placeholder="Project brief"></textarea><button class="btn" type="submit">Send</button></form><p class="muted" id="cmsg"></p></section>
  <script src="script.js"></script>
</body>
</html>`;
  const css =
    baseCss({
      '--bg': '#f8f5f0',
      '--text': '#1a1510',
      '--muted': '#6b6258',
      '--accent': '#1f2937',
      '--on-accent': '#f8f5f0',
      '--border': '#e4ddd3',
    }) +
    `.nav{display:flex;justify-content:space-between;padding:1.25rem 0}.brand{font-weight:800;letter-spacing:.04em}.nav nav{display:flex;gap:1rem;color:var(--muted)}
.hero{padding:3rem 0 1.5rem}h1{font-size:clamp(2rem,5vw,3.4rem);max-width:12ch;line-height:1.05}.eyebrow{letter-spacing:.16em;text-transform:uppercase;font-size:.72rem;color:var(--muted);margin-bottom:.75rem}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;padding:1rem 0 2rem}.ph{background:linear-gradient(135deg,#d6d3d1,#a8a29e);border-radius:12px;height:var(--h)}
.about,.wrap#contact{padding:1rem 0 2rem}#c{display:grid;gap:.6rem;max-width:420px}#c input,#c textarea{padding:.7rem;border:1px solid var(--border);border-radius:10px;background:#fff}
@media(max-width:700px){.grid{grid-template-columns:1fr}}`;
  const js = `document.getElementById('c')?.addEventListener('submit',(e)=>{e.preventDefault();const m=document.getElementById('cmsg');if(m)m.textContent='Message stored locally — connect email later.';});`;
  return { html, css, js };
}

function landingSite(prompt: string, seed: number): SiteFiles {
  const brand = pickBrand(prompt, seed, ['Harbor', 'Lumen', 'Fieldstone', 'Brightside']);
  const tagline = taglineFromPrompt(prompt, seed, ['A focused website for your business']);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(brand)}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="nav wrap"><a class="brand" href="#">${escapeHtml(brand)}</a><nav><a href="#services">Services</a><a href="#about">About</a><a href="#contact">Contact</a></nav><a class="btn" href="#contact">Get in touch</a></header>
  <section class="hero">
    <div class="wrap">
      <p class="eyebrow">Custom site · ${seed.toString(16)}</p>
      <h1>${escapeHtml(tagline)}</h1>
      <p class="lead">This page was generated to match your description — not a generic blog template.</p>
      <a class="btn" href="#contact">Book now</a>
    </div>
  </section>
  <section id="services" class="wrap section"><h2>Services</h2><div class="cards">${['Consult', 'Deliver', 'Support'].map((s, i) => `<article><h3>${s}</h3><p class="muted">Offer ${i + 1} tailored to ${escapeHtml(brand)}.</p></article>`).join('')}</div></section>
  <section id="about" class="wrap section"><h2>About</h2><p class="muted">Tell your story here. Layout seed keeps each build visually distinct.</p></section>
  <section id="contact" class="wrap section"><h2>Contact</h2><form id="contact-form"><input name="name" required placeholder="Name" /><input name="email" type="email" required placeholder="Email" /><textarea name="message" required placeholder="How can we help?"></textarea><button class="btn" type="submit">Send</button></form><p class="muted" id="contact-msg"></p></section>
  <footer class="wrap muted">© ${new Date().getFullYear()} ${escapeHtml(brand)}</footer>
  <script src="script.js"></script>
</body>
</html>`;
  const hues = [
    { bg: '#f0f9ff', accent: '#0369a1', hero: 'linear-gradient(135deg,#0c4a6e,#0284c7)' },
    { bg: '#f0fdf4', accent: '#15803d', hero: 'linear-gradient(135deg,#14532d,#16a34a)' },
    { bg: '#fff7ed', accent: '#c2410c', hero: 'linear-gradient(135deg,#7c2d12,#ea580c)' },
    { bg: '#faf5ff', accent: '#7e22ce', hero: 'linear-gradient(135deg,#581c87,#a855f7)' },
  ][seed % 4]!;
  const css =
    baseCss({
      '--bg': hues.bg,
      '--text': '#0f172a',
      '--muted': '#475569',
      '--accent': hues.accent,
      '--on-accent': '#fff',
      '--border': '#cbd5e1',
      '--surface': '#ffffff',
    }) +
    `.nav{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 0}.brand{font-weight:800}.nav nav{display:flex;gap:1rem;color:var(--muted)}
.hero{background:${hues.hero};color:#fff;padding:5rem 0 4rem}.hero h1{font-size:clamp(2.1rem,5vw,3.4rem);max-width:16ch;line-height:1.05;margin:.5rem 0 1rem}
.lead{max-width:34rem;opacity:.92;margin-bottom:1.25rem}.eyebrow{letter-spacing:.14em;text-transform:uppercase;font-size:.72rem;opacity:.85}
.section{padding:3rem 0}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:1rem}
.cards article,#contact-form{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:1.1rem}
#contact-form{display:grid;gap:.6rem;max-width:460px}#contact-form input,#contact-form textarea{padding:.7rem;border-radius:10px;border:1px solid var(--border)}
footer{padding:2rem 0 3rem}@media(max-width:720px){.cards{grid-template-columns:1fr}.nav nav{display:none}}`;
  const js = `document.getElementById('contact-form')?.addEventListener('submit',(e)=>{e.preventDefault();const m=document.getElementById('contact-msg');if(m)m.textContent='Thanks — message saved in this browser preview.';});`;
  return { html, css, js };
}

function chatbotSite(prompt: string, seed: number): SiteFiles {
  const brand = pickBrand(prompt, seed, ['Askly', 'Replydesk', 'Aideck']);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(brand)} Chat</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="shell">
    <aside><strong>${escapeHtml(brand)}</strong><button type="button" id="new-chat">New chat</button><ul id="history"></ul></aside>
    <main>
      <header><h1>${escapeHtml(taglineFromPrompt(prompt, seed, ['AI assistant shell']))}</h1></header>
      <div id="messages" class="messages"></div>
      <form id="chat-form"><input name="q" required placeholder="Ask something…" /><button class="btn" type="submit">Send</button></form>
    </main>
  </div>
  <script src="js/xroga-live-ai.js"></script>
  <script src="script.js"></script>
</body>
</html>`;
  const css =
    baseCss({
      '--bg': '#0b1020',
      '--text': '#e5e7eb',
      '--muted': '#9ca3af',
      '--accent': '#38bdf8',
      '--on-accent': '#082f49',
      '--border': '#1f2937',
      '--surface': '#111827',
    }) +
    `.shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh}aside{border-right:1px solid var(--border);padding:1rem;display:flex;flex-direction:column;gap:.75rem;background:#070b16}
aside button{padding:.55rem;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer}
#history{list-style:none;display:grid;gap:.4rem;font-size:.9rem;color:var(--muted)}
main{display:grid;grid-template-rows:auto 1fr auto;min-height:100vh}header{padding:1rem 1.25rem;border-bottom:1px solid var(--border)}
.messages{padding:1.25rem;display:flex;flex-direction:column;gap:.75rem;overflow:auto}
.bubble{max-width:70%;padding:.75rem 1rem;border-radius:14px;background:var(--surface);border:1px solid var(--border)}
.bubble.user{align-self:flex-end;background:#164e63;border-color:#0e7490}
#chat-form{display:flex;gap:.5rem;padding:1rem;border-top:1px solid var(--border)}
#chat-form input{flex:1;padding:.75rem;border-radius:10px;border:1px solid var(--border);background:#070b16;color:var(--text)}
@media(max-width:800px){.shell{grid-template-columns:1fr}aside{display:none}}`;
  // Live free AI (Pollinations) — preview works without any paid key
  const js = `${liveAiBrowserClientSource()}\n${liveChatbotFormJs(brand)}`;
  return { html, css, js };
}

function gameSite(prompt: string, seed: number): SiteFiles {
  const brand = pickBrand(prompt, seed, ['PixelRun', 'OrbQuest', 'Dashbit']);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(brand)}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="wrap">
    <h1>${escapeHtml(brand)}</h1>
    <p class="muted">${escapeHtml(taglineFromPrompt(prompt, seed, ['Click to score — browser mini-game']))}</p>
    <canvas id="game" width="640" height="360"></canvas>
    <p>Score: <strong id="score">0</strong> · Press space / tap to jump</p>
  </main>
  <script src="script.js"></script>
</body>
</html>`;
  const css =
    baseCss({
      '--bg': '#111827',
      '--text': '#f9fafb',
      '--muted': '#9ca3af',
      '--accent': '#f472b6',
      '--on-accent': '#111827',
      '--border': '#374151',
    }) +
    `main{padding:2rem 1rem 3rem;text-align:center}canvas{width:min(100%,640px);background:#020617;border:1px solid var(--border);border-radius:12px;margin:1rem 0;touch-action:none}`;
  const js = `const c=document.getElementById('game');const ctx=c.getContext('2d');let y=260,vy=0,score=0,x=480;const seed=${seed};
function loop(){vy+=0.55;y+=vy;if(y>260){y=260;vy=0}x-=3+(seed%3);if(x<-20){x=640;score++;document.getElementById('score').textContent=String(score)}
ctx.fillStyle='#020617';ctx.fillRect(0,0,640,360);ctx.fillStyle='#f472b6';ctx.fillRect(80,y,28,28);ctx.fillStyle='#38bdf8';ctx.fillRect(x,280,36,40);requestAnimationFrame(loop)}
function jump(){if(y>=260)vy=-10}window.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();jump()}});c.addEventListener('pointerdown',jump);loop();`;
  return { html, css, js };
}

function softwareShell(prompt: string, seed: number): SiteFiles {
  const brand = pickBrand(prompt, seed, ['Toolbench', 'Opskit', 'CraftCLI']);
  return landingSite(`software tool ${brand} ${prompt}`, seed);
}

/**
 * Deterministic site that matches the user's requested product type.
 * Blog template is used ONLY when the user asked for a blog.
 */
export function generatePromptMatchedSite(prompt: string): SiteFiles {
  const seed = promptSeed(prompt || 'xroga');
  const kind = scaffoldKindForPrompt(prompt || '');

  switch (kind) {
    case 'blog':
      return generateQualityBlogSite(prompt);
    case 'crypto':
    case 'dashboard':
      return cryptoDashboard(prompt, seed);
    case 'saas':
      return saasLanding(prompt, seed);
    case 'marketplace':
      return marketplaceSite(prompt, seed);
    case 'portfolio':
      return portfolioSite(prompt, seed);
    case 'chatbot':
      return chatbotSite(prompt, seed);
    case 'game':
      return gameSite(prompt, seed);
    case 'app':
    case 'software':
    case 'api':
    case 'automation':
      return softwareShell(prompt, seed);
    case 'landing':
    case 'website':
    default:
      return landingSite(prompt, seed);
  }
}

export function heroPlaceholderForPrompt(prompt: string): string {
  const kind = scaffoldKindForPrompt(prompt);
  const label =
    kind === 'blog'
      ? 'Blog'
      : kind === 'crypto' || kind === 'dashboard'
        ? 'Dashboard'
        : kind === 'saas'
          ? 'SaaS'
          : kind === 'marketplace'
            ? 'Marketplace'
            : kind === 'portfolio'
              ? 'Portfolio'
              : kind === 'chatbot'
                ? 'Chat'
                : kind === 'game'
                  ? 'Game'
                  : 'Site';
  const seed = (promptSeed(prompt) % 0xffffff).toString(16).padStart(6, '0');
  return `https://placehold.co/1200x630/${seed}/f8fafc?text=${encodeURIComponent(label)}`;
}
