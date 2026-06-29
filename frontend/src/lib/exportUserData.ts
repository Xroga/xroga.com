import { loadChatArchive } from '@/lib/chatArchive';
import { loadLocalProjects } from '@/lib/projectArchive';
import { loadMediaItems } from '@/lib/mediaStorage';

export function exportUserData(): void {
  const media = loadMediaItems().map((m) => ({
    ...m,
    url: m.url.startsWith('data:') ? '[embedded-data-url]' : m.url,
  }));

  const payload = {
    exportedAt: new Date().toISOString(),
    chats: loadChatArchive(),
    projects: loadLocalProjects(),
    media,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `xroga-export-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function clearLocalUserData(): void {
  const keys = [
    'xroga_chat_archive',
    'xroga_local_projects',
    'xroga_media_gallery',
    'xroga_workspace_session',
    'xroga-privacy-v1',
    'xroga-item-meta',
  ];
  keys.forEach((k) => localStorage.removeItem(k));
  sessionStorage.clear();
}
