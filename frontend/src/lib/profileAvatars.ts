/** Curated profile avatars — bundled assets (not AI-generated at pick time) */

export interface ProfileAvatar {
  url: string;
  label: string;
}

export const XROGA_PROFILE_AVATARS: ProfileAvatar[] = [
  { url: '/profiles/portrait-friendly-v2.webp', label: 'Friendly builder' },
  { url: '/profiles/portrait-sunset-v2.webp', label: 'Sunset portrait' },
  { url: '/profiles/portrait-agent-v2.webp', label: 'Secret agent' },
  { url: '/profiles/portrait-golden-v2.webp', label: 'Golden-hour portrait' },
  { url: '/profiles/portrait-adventurer-v2.webp', label: 'Block adventurer' },
];

export const XROGA_PROFILE_AVATAR_URLS: string[] = XROGA_PROFILE_AVATARS.map((a) => a.url);
