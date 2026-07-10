export type TaskCadence = 'daily' | 'weekly' | 'monthly' | 'once' | 'special';

export interface TaskDefinition {
  id: string;
  cadence: TaskCadence;
  title: string;
  description: string;
  platform: string;
  frequency: string;
  xrgReward: number;
  tokenBoost: number;
  verification: 'screenshot' | 'screenshot_link' | 'automatic';
  requirements: string[];
  examplePost?: string;
  keywords?: string[];
}

export const TASK_CATALOG: TaskDefinition[] = [
  {
    id: 'daily_x_post',
    cadence: 'daily',
    title: 'Post on X (Twitter)',
    description: 'Post about Xroga AI on X (Twitter)',
    platform: 'X (Twitter)',
    frequency: 'Daily — resets every 24 hours',
    xrgReward: 200,
    tokenBoost: 1500,
    verification: 'screenshot_link',
    requirements: [
      'Public post',
      'Must include @XrogaAI',
      'Must include #XrogaAI',
      'Must include link to Xroga AI website',
    ],
    examplePost:
      'Just built an amazing app with @XrogaAI! The AI coding assistant is incredible. #XrogaAI https://xroga.ai',
    keywords: ['#XrogaAI', '@XrogaAI'],
  },
  {
    id: 'daily_facebook',
    cadence: 'daily',
    title: 'Share on Facebook',
    description: 'Share about Xroga AI on Facebook',
    platform: 'Facebook',
    frequency: 'Daily — resets every 24 hours',
    xrgReward: 150,
    tokenBoost: 1000,
    verification: 'screenshot_link',
    requirements: [
      'Public post',
      'Must include #XrogaAI',
      'Must include link to Xroga AI website',
    ],
    examplePost:
      "I'm building with Xroga AI – the best AI platform for developers! Check it out: https://xroga.ai #XrogaAI",
  },
  {
    id: 'daily_instagram',
    cadence: 'daily',
    title: 'Post on Instagram',
    description: 'Post about Xroga AI on Instagram',
    platform: 'Instagram',
    frequency: 'Daily — resets every 24 hours',
    xrgReward: 150,
    tokenBoost: 1000,
    verification: 'screenshot_link',
    requirements: [
      'Public post (not story)',
      'Must include #XrogaAI',
      'Must include link in bio or caption',
    ],
    examplePost:
      'Building my next project with @xroga_ai – the AI that builds anything! #XrogaAI',
  },
  {
    id: 'daily_ig_story',
    cadence: 'daily',
    title: 'Instagram Story',
    description: 'Post about Xroga AI on Instagram Story',
    platform: 'Instagram',
    frequency: 'Daily — resets every 24 hours',
    xrgReward: 100,
    tokenBoost: 800,
    verification: 'screenshot',
    requirements: [
      'Public story',
      'Must include @xroga_ai tag',
      'Must include link sticker to Xroga AI',
    ],
    examplePost: 'Share a screenshot of your Xroga AI project with a link sticker',
  },
  {
    id: 'daily_checkin',
    cadence: 'daily',
    title: 'Daily Check-in',
    description: 'Daily Check-in on Xroga AI',
    platform: 'Xroga AI (in-app)',
    frequency: 'Daily — resets every 24 hours',
    xrgReward: 50,
    tokenBoost: 500,
    verification: 'automatic',
    requirements: ['Open Xroga AI', 'Click "Check-in" button', 'User must be logged in'],
    examplePost: 'Click the Check-in button on the Earn XRG page',
  },
  {
    id: 'weekly_project_update',
    cadence: 'weekly',
    title: 'Share Project Update',
    description: 'Share a project update on X or LinkedIn',
    platform: 'X (Twitter) OR LinkedIn',
    frequency: 'Weekly — resets every Monday',
    xrgReward: 1000,
    tokenBoost: 5000,
    verification: 'screenshot_link',
    requirements: [
      'Public post',
      'Show progress on a project built with Xroga AI',
      'Must include @XrogaAI or #XrogaAI',
      'Must include screenshots or demo link',
    ],
    examplePost:
      "Week 2 of building my SaaS with @XrogaAI! Here's what I built so far: [screenshot] #XrogaAI https://xroga.ai",
  },
  {
    id: 'weekly_tutorial',
    cadence: 'weekly',
    title: 'Post Tutorial Snippet',
    description: 'Post a tutorial snippet about Xroga AI',
    platform: 'X, LinkedIn, or Instagram',
    frequency: 'Weekly — resets every Monday',
    xrgReward: 1500,
    tokenBoost: 8000,
    verification: 'screenshot_link',
    requirements: [
      'Public post',
      'Teach something about Xroga AI',
      'Must include code or UI snippet',
      'Must include #XrogaAI',
    ],
    examplePost:
      'Tip: You can generate a full API with Xroga AI in 1 prompt! Here\'s how: [code snippet] #XrogaAI',
  },
  {
    id: 'weekly_youtube_short',
    cadence: 'weekly',
    title: 'YouTube Short',
    description: 'Post a YouTube Short about Xroga AI',
    platform: 'YouTube (Shorts)',
    frequency: 'Weekly — resets every Monday',
    xrgReward: 2000,
    tokenBoost: 12000,
    verification: 'screenshot_link',
    requirements: [
      'Public video (Shorts format)',
      '15–60 seconds',
      'Must show Xroga AI in action',
      'Must include #XrogaAI in title/description',
    ],
    examplePost: '30-second demo showing Xroga AI building a React component',
  },
  {
    id: 'monthly_youtube_video',
    cadence: 'monthly',
    title: 'Full YouTube Video',
    description: 'Post a full YouTube video about Xroga AI',
    platform: 'YouTube',
    frequency: 'Monthly — resets on the 1st',
    xrgReward: 5000,
    tokenBoost: 30000,
    verification: 'screenshot_link',
    requirements: [
      'Public video',
      '3–10 minutes',
      'Must show Xroga AI building a complete project',
      'Must include #XrogaAI in title/description',
    ],
    examplePost: 'Building a Full-Stack App with Xroga AI in 10 Minutes',
  },
  {
    id: 'monthly_blog',
    cadence: 'monthly',
    title: 'Blog Post',
    description: 'Write a blog post about Xroga AI',
    platform: 'Medium, Dev.to, Personal Blog, LinkedIn',
    frequency: 'Monthly — resets on the 1st',
    xrgReward: 3000,
    tokenBoost: 20000,
    verification: 'screenshot_link',
    requirements: [
      'Public article',
      '500+ words',
      'Must mention Xroga AI',
      'Must include link to Xroga AI website',
    ],
    examplePost: 'How I Built My First SaaS with Xroga AI in 7 Days',
  },
  {
    id: 'monthly_case_study',
    cadence: 'monthly',
    title: 'Case Study',
    description: 'Write a case study about Xroga AI',
    platform: 'Medium, Dev.to, Personal Blog',
    frequency: 'Monthly — resets on the 1st',
    xrgReward: 4000,
    tokenBoost: 25000,
    verification: 'screenshot_link',
    requirements: [
      'Public article',
      '800+ words',
      'Must include measurable results',
      'Must mention Xroga AI',
      'Must include link to Xroga AI website',
    ],
    examplePost: 'Case Study: Building a $10K/month SaaS with Xroga AI',
  },
  {
    id: 'referral',
    cadence: 'once',
    title: 'Refer a Friend',
    description: 'Refer a friend to Xroga AI',
    platform: 'Any',
    frequency: 'One-time per referral',
    xrgReward: 5000,
    tokenBoost: 30000,
    verification: 'automatic',
    requirements: [
      'Friend signs up using your referral code',
      'Friend subscribes to a paid plan',
      'Friend stays active for 30 days',
    ],
    examplePost: 'Share your referral link — rewards credit automatically when verified',
  },
  {
    id: 'ugc_challenge',
    cadence: 'special',
    title: 'UGC Challenge',
    description: 'Participate in UGC Challenge',
    platform: 'X, Instagram, TikTok, YouTube',
    frequency: 'Monthly — 1 per user',
    xrgReward: 2000,
    tokenBoost: 15000,
    verification: 'screenshot_link',
    requirements: [
      'Create original content about Xroga AI',
      'Reach 1,000+ views',
      'Must include #XrogaAI',
    ],
    examplePost: 'Original video or post showcasing your Xroga AI project',
  },
];

export function consistencyBonusPercent(streakMonths: number): number {
  if (streakMonths <= 1) return 0;
  if (streakMonths === 2) return 5;
  if (streakMonths === 3) return 10;
  if (streakMonths === 4) return 15;
  return 20;
}
