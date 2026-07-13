/** Frontend feature catalog — synced with backend /api/v1/features */

export interface FeatureCatalogItem {
  id: string;
  name: string;
  category: string;
  promptTemplate: string;
}

export const FEATURE_CATALOG_FRONTEND: FeatureCatalogItem[] = [
  { id: 'chat', name: 'Chat / Text AI', category: 'Core', promptTemplate: '' },
  { id: 'code_generation', name: 'Code Generation', category: 'Build', promptTemplate: 'Write production-ready code for: ' },
  { id: 'image_generation', name: 'Image Generation', category: 'Media', promptTemplate: 'Generate an image of: ' },
  { id: 'ai_video', name: 'AI video prompts (coming soon)', category: 'Media', promptTemplate: 'Write a video prompt for: ' },
  { id: 'movie_script', name: 'Creative scripts', category: 'Creative', promptTemplate: 'Write a creative script about: ' },
  { id: '3d_model', name: '3D Model Generation', category: 'Media', promptTemplate: 'Generate a 3D model of: ' },
  { id: 'web_research', name: 'Web search & research', category: 'Research', promptTemplate: 'Research: ' },
  { id: 'code_debug', name: 'Code debug & fix', category: 'Build', promptTemplate: 'Debug and fix: ' },
  { id: 'browser_scrape', name: 'Browser automation & scrape', category: 'Automation', promptTemplate: 'Scrape data from: ' },
  { id: 'voice_clone', name: 'Voice TTS & cloning', category: 'Media', promptTemplate: 'Create voice for: ' },
  { id: 'website_gen', name: 'Website generation', category: 'Build', promptTemplate: 'Build a website for: ' },
  { id: 'github_deploy', name: 'GitHub connect & deploy', category: 'Deploy', promptTemplate: 'Deploy via GitHub: ' },
  { id: 'vercel_deploy', name: 'Vercel deploy hook', category: 'Deploy', promptTemplate: 'Deploy to Vercel: ' },
  { id: 'deploy_fly', name: 'Fly.io Deploy', category: 'Deploy', promptTemplate: 'Deploy to Fly.io: ' },
  { id: 'social_posting', name: 'Social Media Posting', category: 'Automation', promptTemplate: 'Post this to social media: ' },
  { id: 'character_profile', name: 'Character Profile', category: 'Creative', promptTemplate: 'Create a character profile for: ' },
  { id: 'script_outline', name: 'Script Outline / Logline', category: 'Creative', promptTemplate: 'Write a script outline for: ' },
  { id: 'storyboard', name: 'Storyboard (5 key frames)', category: 'Creative', promptTemplate: 'Storyboard 5 frames for: ' },
  { id: 'full_episode', name: 'Full Episode (45 min)', category: 'Media', promptTemplate: 'Write a full episode about: ' },
  { id: 'deep_research', name: 'Deep Research Report', category: 'Research', promptTemplate: 'Deep research on: ' },
];

export async function fetchFeatureCatalog(): Promise<FeatureCatalogItem[]> {
  try {
    const { API_URL, getAccessToken } = await import('./api');
    const token = await getAccessToken();
    const res = await fetch(`${API_URL}/api/v1/features`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return FEATURE_CATALOG_FRONTEND;
    const data = (await res.json()) as { features: FeatureCatalogItem[] };
    return data.features?.length ? data.features : FEATURE_CATALOG_FRONTEND;
  } catch {
    return FEATURE_CATALOG_FRONTEND;
  }
}
