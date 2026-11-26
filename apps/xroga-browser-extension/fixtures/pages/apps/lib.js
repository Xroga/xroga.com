// Shared helpers for the holdout apps. A variant (?v=N) randomises what a site-specific script could never rely on: label wording and language, control order, an overlay in the
// way, a late-rendering interface, page zoom and text direction. State the grader reads is in window.__state (never drawn as text the agent could just copy).
window.Q = new URLSearchParams(location.search);
window.SEED = Number(Q.get('v') || 1);
let _a = (SEED * 2654435761) >>> 0;
window.rnd = () => (_a = (_a * 1664525 + 1013904223) >>> 0) / 4294967296;
window.pick = list => list[Math.floor(rnd() * list.length)];
window.shuffle = list => { const r = [...list]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
window.__state = {};
window.VARIANT = { overlay: SEED % 2 === 1, delay: [0, 700, 1500, 400][SEED % 4], zoom: [1, 1, 1.25, 0.9][SEED % 4], rtl: Q.get('rtl') === '1' };
if (VARIANT.zoom !== 1) document.documentElement.style.zoom = String(VARIANT.zoom);
if (VARIANT.rtl) document.documentElement.dir = 'rtl';
/** Renders `build()` into #app after the variant's delay (a late-rendering interface). */
// State survives a reload, as an app's saved data does (per tab and per variant): restored before the interface is built, saved a few times a second.
const STORE_KEY = 'holdout:' + location.pathname + ':' + SEED;
window.mount = build => setTimeout(() => {
  try { const saved = sessionStorage.getItem(STORE_KEY); if (saved) Object.assign(__state, JSON.parse(saved)); } catch { /* no storage: state starts fresh */ }
  const keep = () => { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(__state)); } catch { /* ignore */ } }; setInterval(keep, 150); addEventListener('pagehide', keep); addEventListener('beforeunload', keep); document.getElementById('app').innerHTML = ''; build(document.getElementById('app')); if (VARIANT.overlay) cookieBanner(); }, VARIANT.delay);
window.cookieBanner = () => {
  const d = document.createElement('div');
  d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Cookie notice');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#222;color:#fff;padding:14px;z-index:9;text-align:center';
  d.innerHTML = 'We use cookies to improve this site. <button type="button" id="cookie-ok">Accept</button>';
  document.body.appendChild(d);
  d.querySelector('button').addEventListener('click', () => d.remove());
};
window.h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
};
