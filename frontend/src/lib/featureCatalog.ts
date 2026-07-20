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
  { id: 'website_gen', name: 'Website generation', category: 'Build', promptTemplate: 'Build a website for: ' },
  { id: 'saas_gen', name: 'SaaS / dashboard', category: 'Build', promptTemplate: 'Build a SaaS dashboard with auth for: ' },
  { id: 'mobile_expo', name: 'Expo Android/iOS scaffold', category: 'Build', promptTemplate: 'Build an Expo mobile app for: ' },
  { id: 'chrome_ext', name: 'Chrome extension (MV3)', category: 'Build', promptTemplate: 'Build a Chrome MV3 extension that: ' },
  { id: 'electron_app', name: 'Electron desktop scaffold', category: 'Build', promptTemplate: 'Build an Electron desktop app for: ' },
  { id: 'web_research', name: 'Web search & research', category: 'Research', promptTemplate: 'Research: ' },
  { id: 'code_debug', name: 'Code debug & fix', category: 'Build', promptTemplate: 'Debug and fix: ' },
  { id: 'github_deploy', name: 'GitHub connect & deploy', category: 'Deploy', promptTemplate: 'Deploy via GitHub: ' },
  { id: 'vercel_deploy', name: 'Vercel deploy', category: 'Deploy', promptTemplate: 'Deploy to Vercel: ' },
  { id: 'eas_publish', name: 'EAS publish trigger', category: 'Deploy', promptTemplate: 'Publish mobile build with EAS for: ' },
  { id: 'movie_script', name: 'Creative scripts (text)', category: 'Creative', promptTemplate: 'Write a creative script about: ' },
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
    const data = (await res.json()) as { features?: FeatureCatalogItem[] };
    return data.features?.length ? data.features : FEATURE_CATALOG_FRONTEND;
  } catch {
    return FEATURE_CATALOG_FRONTEND;
  }
}
