export type TaskCadence = 'daily' | 'weekly' | 'monthly';

export interface TaskDefinition {
  id: string;
  cadence: TaskCadence;
  title: string;
  description: string;
  xrgReward: number;
  tokenBoost: number;
  verification: 'screenshot' | 'screenshot_link' | 'automatic';
  keywords?: string[];
}

export const TASK_CATALOG: TaskDefinition[] = [
  { id: 'daily_x_post', cadence: 'daily', title: 'Post on X (Twitter)', description: 'Share Xroga AI with #XrogaAI', xrgReward: 50, tokenBoost: 200, verification: 'screenshot_link', keywords: ['#XrogaAI', '@XrogaAI'] },
  { id: 'daily_facebook', cadence: 'daily', title: 'Share on Facebook', description: 'Share your Xroga build on Facebook', xrgReward: 40, tokenBoost: 150, verification: 'screenshot_link' },
  { id: 'daily_instagram', cadence: 'daily', title: 'Post on Instagram', description: 'Post about Xroga on Instagram', xrgReward: 40, tokenBoost: 150, verification: 'screenshot_link' },
  { id: 'daily_ig_story', cadence: 'daily', title: 'Instagram Story', description: 'Share an Instagram story mentioning Xroga', xrgReward: 25, tokenBoost: 100, verification: 'screenshot' },
  { id: 'daily_checkin', cadence: 'daily', title: 'Daily Check-in', description: 'Open your workspace today', xrgReward: 15, tokenBoost: 50, verification: 'automatic' },
  { id: 'weekly_project_update', cadence: 'weekly', title: 'Share Project Update', description: 'Post a project update with screenshot + link', xrgReward: 200, tokenBoost: 800, verification: 'screenshot_link' },
  { id: 'weekly_tutorial', cadence: 'weekly', title: 'Post Tutorial Snippet', description: 'Share a short tutorial using Xroga', xrgReward: 300, tokenBoost: 1000, verification: 'screenshot_link' },
  { id: 'weekly_youtube_short', cadence: 'weekly', title: 'YouTube Short', description: 'Publish a YouTube Short about Xroga', xrgReward: 400, tokenBoost: 1500, verification: 'screenshot_link' },
  { id: 'monthly_youtube_video', cadence: 'monthly', title: 'Full YouTube Video', description: 'Publish a full video featuring Xroga', xrgReward: 1000, tokenBoost: 4000, verification: 'screenshot_link' },
  { id: 'monthly_blog', cadence: 'monthly', title: 'Blog Post', description: 'Write a blog article about your Xroga experience', xrgReward: 600, tokenBoost: 2500, verification: 'screenshot_link' },
  { id: 'monthly_case_study', cadence: 'monthly', title: 'Case Study', description: 'Publish a detailed case study', xrgReward: 800, tokenBoost: 3000, verification: 'screenshot_link' },
];

export function consistencyBonusPercent(streakMonths: number): number {
  if (streakMonths <= 1) return 0;
  if (streakMonths === 2) return 5;
  if (streakMonths === 3) return 10;
  if (streakMonths === 4) return 15;
  return 20;
}
