/** Default planning steps shown during product builds (Black Hole thinking panel). */
export const BUILD_PLANNING_STEPS = [
  '🏗️ XROGA Architect — architecture & system design',
  '🗄️ Database schema, API endpoints & infrastructure',
  '⚡ XROGA Pulse — code scaffolding',
  '🧠 XROGA Architect — business logic & security',
  '🎨 XROGA Visionary — UI/UX polish & animations',
  '✅ XROGA Collective — quality & security audit',
  '📂 GitHub push to your selected repository',
  '🚀 Auto-deploy live preview (Vercel + Cloudflare)',
] as const;

/** XROGA AI roles used in post-build summary */
export const XROGA_BUILD_MODELS = [
  'XROGA Architect — architecture design',
  'XROGA Pulse — code scaffolding',
  'XROGA Architect — business logic',
  'XROGA Visionary — UI/UX polish',
  'XROGA Collective + BLACK HOLE V∞ — quality & security audit',
] as const;
