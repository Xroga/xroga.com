/**
 * Editable content for the /about page.
 *
 * Kept out of the component so copy can change without touching markup. Nothing here
 * is a metric or a claim about scale — the page states what the product does, not how
 * many people use it.
 *
 * The founder's age is deliberately absent: it would be stale within a year, and there
 * is no mechanism to keep it correct. Add a birth year and derive it if it is ever
 * genuinely needed.
 */

export interface AboutStage {
  id: string;
  title: string;
  body: string;
}

export interface AboutStep {
  number: string;
  title: string;
  body: string;
}

export interface AboutCapability {
  id: string;
  title: string;
  body: string;
}

export interface AboutFaq {
  question: string;
  answer: string;
}

/** Illustration slots. Absent files fall back to a composed frame, never a stock photo. */
export const ABOUT_ART = {
  hero: '/about/xroga-voxel-hero.png',
  workflow: '/about/xroga-voxel-workflow.png',
  verify: '/about/xroga-voxel-verify.png',
  founder: '/about/xroga-voxel-founder.png',
} as const;

export const ABOUT_SOCIALS = {
  x: 'https://x.com/Xroga_AI',
  github: 'https://github.com/Xroga/xroga.com',
} as const;

export const ABOUT_HERO = {
  eyebrow: 'ABOUT XROGA AI',
  headline: 'AI that builds, verifies, and ships.',
  body:
    'Describe the product you want. Xroga coordinates the code, validation, deployment, and repository updates required to turn that idea into working software.',
  primaryCta: { label: 'Start building', href: '/auth/signup' },
  secondaryCta: { label: 'See how it works', href: '#how-it-works' },
  trustLine: ['GitHub connected', 'Vercel deployed', 'Human-controlled'],
} as const;

export const ABOUT_WHAT_IS = {
  heading: 'Durable work. Verified outcomes.',
  paragraphs: [
    'Workspace activity comes from real backend run events. A build is complete only after its required validation, and publishing is reported only with provider evidence.',
  ],
  stages: [
    { id: 'understand', title: 'Understand and implement', body: 'Inspect the current repository, change the controlled project state, and preserve unrelated code.' },
    { id: 'verify', title: 'Validate and repair', body: 'Run applicable checks, classify real failures, and target the responsible files.' },
    { id: 'publish', title: 'Push and publish with evidence', body: 'Show the remote commit and deployment result, or the exact external setup still required.' },
  ] satisfies AboutStage[],
} as const;

export const ABOUT_STEPS: AboutStep[] = [
  {
    number: '01',
    title: 'Describe the outcome',
    body: 'Explain the website, application, dashboard, browser game, or feature you want in plain language.',
  },
  {
    number: '02',
    title: 'Connect your workspace',
    body: 'Authorize the GitHub repository and Vercel project Xroga should work with.',
  },
  {
    number: '03',
    title: 'Review verified progress',
    body: 'Xroga implements, validates, and publishes changes while keeping the repository synchronized.',
  },
];

export const ABOUT_CAPABILITIES: AboutCapability[] = [
  {
    id: 'build',
    title: 'Converter → Builder → Ship',
    body: 'Understand the outcome · implement focused changes · verify · push the sticky GitHub repo · publish with evidence.',
  },
  {
    id: 'verify',
    title: 'Automatic capability routing',
    body: 'Black Hole V∞ brings frontier coding depth, long-context repositories, and live research without a vendor model picker.',
  },
  {
    id: 'publish',
    title: 'GitHub push · Vercel live',
    body: 'Preview in Workspace, push the sticky repository, and go live on your domain while ownership stays yours.',
  },
  {
    id: 'research',
    title: 'Research that ships',
    body: 'Gather live sources when needed, then turn findings into code in the same connected product flow.',
  },
];

export const ABOUT_EXECUTION = {
  heading: 'From idea to verified software.',
  body:
    'Xroga keeps implementation, repository state, deployment, and user intent aligned. The goal is not to generate more conversation. The goal is to complete real work responsibly.',
  checklist: [
    'Repository-aware implementation',
    'GitHub synchronization',
    'Vercel deployment',
    'Secure environment-variable handling',
    'Clear blockers and recovery steps',
    'Suitable for developers and non-developers',
  ],
} as const;

export const ABOUT_FOUNDER = {
  name: 'Muhammad Ibrahim',
  role: 'Founder & CEO',
  paragraphs: [
    'Xroga was founded around a simple conviction: useful AI should not only answer questions—it should execute carefully, verify its work, and remain accountable to the user.',
    'Behind Xroga is a growing team of engineers, designers, and AI researchers working to make advanced software execution accessible, honest, and affordable.',
  ],
} as const;

export const ABOUT_FAQS: AboutFaq[] = [
  {
    question: 'What can Xroga build?',
    answer:
      'Websites, web applications, dashboards, browser games, Chrome extensions, desktop software, and mobile apps through Expo. It also works inside existing repositories to add features, fix errors, and update what is already there.',
  },
  {
    question: 'Does Xroga need access to my GitHub account?',
    answer:
      'Only if you want code pushed to a repository. You authorize the connection, you choose the repository, and the code lands in a repository you own. Xroga can build and preview without GitHub, but it cannot push without it.',
  },
  {
    question: 'How does deployment work?',
    answer:
      'Through your own connected Vercel account and your own domain. Xroga reports a deployment only with provider evidence — if the deployment cannot be confirmed, it says so rather than claiming success.',
  },
  {
    question: 'Can non-developers use Xroga?',
    answer:
      'Yes. You describe the outcome in plain language. Connecting GitHub and Vercel is a one-time authorization step, and Xroga explains the exact setup still required when something is missing.',
  },
  {
    question: 'How are API keys handled?',
    answer:
      'Provider keys are held server-side and are never sent to the browser. Keys you add are stored in the server-side integration vault, and generated projects ship a placeholder env file listing the variable names you need to set — never their values.',
  },
  {
    question: 'What happens when Xroga cannot complete a task?',
    answer:
      'It reports the exact blocker instead of a vague failure or a fabricated success: the failing check, the missing authorization, or the external setup required. Work is only reported complete after its applicable validation actually passes.',
  },
];

export const ABOUT_FINAL_CTA = {
  headline: 'Bring the idea. Xroga will help execute it.',
  body: 'Connect your workspace and turn a product description into verified, deployable progress.',
  primary: { label: 'Get Started', href: '/auth/signup' },
  secondary: { label: 'Contact Xroga', href: '/contact' },
} as const;
