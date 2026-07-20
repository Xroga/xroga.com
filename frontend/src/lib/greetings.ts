const INSPIRING_LINES = [
  'Your Swarm is ready — ship something legendary today.',
  'One command away from your next app, game, or automation.',
  'GitHub + Vercel + Supabase — authorize once, then ship.',
  'Fuel the swarm — turn ideas into deployed products.',
  'Architect · Builder · Reviewer · QA — all working for you.',
  'Automate the boring. Create the extraordinary.',
  'From prompt to production — Xroga has your back.',
  'Small actions, massive output. That is the Xroga way.',
  'Debug less. Deploy more. Let the swarm handle the rest.',
  'Today is a great day to launch something new.',
];

export function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good night';
}

export function getInspiringLine(seed?: string): string {
  const day = new Date().toDateString();
  const base = seed ? `${day}-${seed}` : day;
  let hash = 0;
  for (let i = 0; i < base.length; i++) hash = (hash + base.charCodeAt(i) * (i + 1)) % INSPIRING_LINES.length;
  return INSPIRING_LINES[hash];
}
