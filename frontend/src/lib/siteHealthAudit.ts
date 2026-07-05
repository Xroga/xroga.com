export interface SiteHealthIssue {
  id: string;
  severity: 'error' | 'warn' | 'info';
  area: string;
  message: string;
  fixPrompt: string;
}

export interface SiteHealthReport {
  score: number;
  issues: SiteHealthIssue[];
  working: string[];
}

/** Quick client-side audit of generated landing page code. */
export function auditLandingSite(html: string, css: string, js: string): SiteHealthReport {
  const issues: SiteHealthIssue[] = [];
  const working: string[] = [];
  const h = html.toLowerCase();
  const c = css.trim();
  const j = js.trim();

  if (c.length > 80) working.push('CSS styles loaded');
  else
    issues.push({
      id: 'css-thin',
      severity: 'error',
      area: 'styles.css',
      message: 'CSS is very thin — hosted preview may look unstyled.',
      fixPrompt: 'Expand styles.css with modern layout, colors, typography, and responsive breakpoints.',
    });

  if (/<nav|navigation/i.test(html)) working.push('Navigation present');
  else
    issues.push({
      id: 'no-nav',
      severity: 'warn',
      area: 'Navigation',
      message: 'No navigation bar detected.',
      fixPrompt: 'Add a sticky header with logo and nav links (Features, Pricing, Contact).',
    });

  if (/<button|class=["'][^"']*btn/i.test(html)) working.push('Buttons / CTAs present');
  else
    issues.push({
      id: 'no-cta',
      severity: 'warn',
      area: 'CTA buttons',
      message: 'No clear call-to-action buttons found.',
      fixPrompt: 'Add primary CTA buttons (Start Free Trial, Book Demo) with hover styles.',
    });

  if (/pricing|price|\$[0-9]/i.test(html)) working.push('Pricing section');
  else if (/saas|pricing plan/i.test(html + h))
    issues.push({
      id: 'no-pricing',
      severity: 'info',
      area: 'Pricing',
      message: 'Pricing section may be incomplete.',
      fixPrompt: 'Add a pricing section with Monthly/Annual toggle and 2–3 plans.',
    });

  if (/href=["']#|scroll|smooth/i.test(html + j)) working.push('Anchor / scroll links');
  if (/addEventListener|onclick|querySelector/i.test(j)) working.push('JavaScript interactivity');
  else if (j.length > 0)
    issues.push({
      id: 'js-idle',
      severity: 'info',
      area: 'JavaScript',
      message: 'Script present but few interactive handlers detected.',
      fixPrompt: 'Add mobile nav toggle, smooth scroll, pricing toggle, and form validation in script.js.',
    });
  else
    issues.push({
      id: 'no-js',
      severity: 'warn',
      area: 'script.js',
      message: 'No JavaScript — toggles and animations will not work.',
      fixPrompt: 'Add dark/light theme toggle, mobile menu, and scroll animations in script.js.',
    });

  if (/dark|theme|prefers-color-scheme/i.test(html + c + j)) working.push('Theme support');
  else
    issues.push({
      id: 'no-theme',
      severity: 'info',
      area: 'Dark mode',
      message: 'No dark/light theme toggle detected.',
      fixPrompt: 'Add a dark/light theme toggle with CSS variables and localStorage persistence.',
    });

  if (/animation|@keyframes|transition/i.test(c)) working.push('CSS animations');
  else
    issues.push({
      id: 'no-motion',
      severity: 'info',
      area: 'Animations',
      message: 'Limited motion / animation in CSS.',
      fixPrompt: 'Add subtle fade-in animations and hover transitions for a modern vibe.',
    });

  if (/@media/i.test(c)) working.push('Responsive breakpoints');
  else
    issues.push({
      id: 'no-responsive',
      severity: 'warn',
      area: 'Responsive',
      message: 'No @media queries — mobile layout may break.',
      fixPrompt: 'Add mobile-first responsive CSS with flex/grid breakpoints.',
    });

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warn').length;
  const score = Math.max(0, 100 - errorCount * 25 - warnCount * 10);

  return { score, issues, working };
}

export const LANDING_UPDATE_SUGGESTIONS = [
  'Change brand name and hero headline',
  'Switch to dark mode with a light/dark toggle',
  'Add animations and modern hover effects',
  'Add a testimonials or logos section',
  'Update pricing plans and features',
  'Fix buttons and JavaScript that are not working',
  'Make it more colorful / change color scheme',
];
