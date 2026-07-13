/** Inlined CSS for global-error — must not depend on root layout or Tailwind */
export const GLOBAL_ERROR_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; min-height: 100%; }
body {
  font-family: 'Outfit', system-ui, -apple-system, sans-serif;
  background: #030712;
  color: #f8fafc;
  -webkit-font-smoothing: antialiased;
}
.xv-ge {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem;
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0, 106, 255, 0.14) 0%, transparent 55%),
    linear-gradient(180deg, #030712 0%, #0a0e17 45%, #020617 100%);
  overflow: hidden;
}
.xv-ge__glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 38%, rgba(96, 165, 250, 0.12) 0%, transparent 42%);
  pointer-events: none;
}
.xv-ge__orb {
  position: absolute;
  top: 16%;
  left: 50%;
  width: 100px;
  height: 100px;
  transform: translateX(-50%);
  pointer-events: none;
}
.xv-ge__core {
  position: absolute;
  inset: 38%;
  border-radius: 50%;
  background: #000;
  box-shadow: 0 0 40px 8px rgba(0, 0, 0, 0.9), inset 0 0 20px rgba(96, 165, 250, 0.15);
}
.xv-ge__ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}
.xv-ge__ring--outer {
  background: conic-gradient(from 210deg, transparent, rgba(96, 165, 250, 0.55), rgba(129, 140, 248, 0.35), transparent);
  mask: radial-gradient(circle, transparent 58%, black 60%);
  -webkit-mask: radial-gradient(circle, transparent 58%, black 60%);
  animation: xv-ge-spin 8s linear infinite;
}
.xv-ge__ring--inner {
  inset: 12%;
  background: conic-gradient(from 30deg, transparent, rgba(56, 189, 248, 0.45), transparent 70%);
  mask: radial-gradient(circle, transparent 52%, black 54%);
  -webkit-mask: radial-gradient(circle, transparent 52%, black 54%);
  animation: xv-ge-spin 5s linear infinite reverse;
}
@keyframes xv-ge-spin { to { transform: rotate(360deg); } }
.xv-ge__panel {
  position: relative;
  z-index: 1;
  width: min(100%, 28rem);
  text-align: center;
  margin-top: 4.5rem;
}
.xv-ge__code {
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: #60a5fa;
  margin: 0 0 0.75rem;
}
.xv-ge__brand {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
  margin: 0 0 1rem;
}
.xv-ge__brand-v { color: #4a9dff; font-weight: 800; }
.xv-ge__title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: clamp(1.45rem, 4vw, 2rem);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0 0 0.75rem;
  color: #f8fafc;
}
.xv-ge__desc {
  font-size: clamp(0.9rem, 2.2vw, 1rem);
  line-height: 1.65;
  color: rgba(226, 232, 240, 0.72);
  margin: 0 0 1.5rem;
}
.xv-ge__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  align-items: center;
}
.xv-ge__btn {
  padding: 0.75rem 1.35rem;
  border-radius: 0.75rem;
  font-family: 'Outfit', system-ui, sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.xv-ge__btn:active { transform: scale(0.98); }
.xv-ge__btn--primary {
  background: linear-gradient(135deg, #006aff 0%, #3b82f6 100%);
  color: #fff;
  box-shadow: 0 8px 24px rgba(0, 106, 255, 0.35);
}
.xv-ge__btn--secondary {
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.55);
  color: #e2e8f0;
}
`;
