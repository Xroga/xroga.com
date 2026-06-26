export interface QuickAction {
  id: string;
  icon: string;
  label: string;
  prompt: string;
  color: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'build-app', icon: '💻', label: 'Build App', prompt: 'Build a full-stack web app for: ', color: '#4a7aff' },
  { id: 'make-movie', icon: '🎬', label: 'Make Movie', prompt: 'Create a cinematic video script and storyboard for: ', color: '#a855f7' },
  { id: 'automate', icon: '🤖', label: 'Automate', prompt: 'Automate this workflow for me: ', color: '#00d4ff' },
  { id: 'games', icon: '🎮', label: 'Games 3D/2D', prompt: 'Build a 3D/2D game: ', color: '#22c55e' },
  { id: 'website', icon: '🌐', label: 'Website · Apps', prompt: 'Build a website or mobile app for: ', color: '#3b82f6' },
  { id: 'media', icon: '🖼️', label: 'Images & Videos', prompt: 'Generate images and videos for: ', color: '#ec4899' },
  { id: 'movies', icon: '🎭', label: 'Movies · Dramas', prompt: 'Write a movie or drama script for: ', color: '#f59e0b' },
  { id: 'debug', icon: '🐛', label: 'Debug · Code Fix', prompt: 'Debug and fix this code: ', color: '#ef4444' },
  { id: 'research', icon: '🔍', label: 'Web Search · Research', prompt: 'Research and summarize: ', color: '#06b6d4' },
  { id: '3d-models', icon: '🎨', label: '3D Models', prompt: 'Generate a 3D model for: ', color: '#8b5cf6' },
  { id: 'voice', icon: '🗣️', label: 'Voice TTS · Cloning', prompt: 'Create voice/TTS content for: ', color: '#14b8a6' },
  { id: 'mobile-games', icon: '📱', label: 'Android/iOS Games', prompt: 'Build an Android/iOS game for: ', color: '#f97316' },
];
