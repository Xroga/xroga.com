/** Incognito mode assets & copy */
export const INCOGNITO_AVATAR_URL = '/incognito/avatar.png';
export const INCOGNITO_BG_URL = '/incognito/bg.png';

export const INCOGNITO_PRIVATE_ROOM_NOTICE =
  'You are in a private room. Your history is not saved — just do chats only.';

export const INCOGNITO_GUIDANCE = [
  'Temporary chat only — ask questions, brainstorm, or talk privately.',
  'No building projects, generating images/videos, or running Swarm tasks.',
  'Nothing is saved to your history. Everything auto-deletes when you leave.',
] as const;

export function getIncognitoAvatarUrl() {
  return INCOGNITO_AVATAR_URL;
}
