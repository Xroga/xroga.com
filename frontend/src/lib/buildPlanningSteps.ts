/** Default planning steps shown during product builds (Black Hole thinking panel). */
export const BUILD_PLANNING_STEPS = [
  'XROGA Architect — architecture & system design',
  'Database schema, API endpoints & infrastructure',
  'XROGA Pulse — code scaffolding',
  'XROGA Architect — business logic & security',
  'XROGA Visionary — UI/UX polish & animations',
  'XROGA Collective — quality & security audit',
  'GitHub push to your selected repository',
  'Auto-deploy live preview (Vercel + Cloudflare)',
] as const;

/** How XROGA builds projects — shown in behind-the-scenes panel */
export const XROGA_BUILD_PROCESS = [
  'Planning — XROGA Architect maps architecture, APIs, and file structure',
  'Building — XROGA Pulse scaffolds components and routes step by step',
  'Review — XROGA Collective verifies quality, security, and integrations',
  'Finalizing — code pushed to GitHub and live preview deployed',
] as const;
