/** Curated profile avatars — bundled assets (not AI-generated at pick time) */

export interface ProfileAvatar {
  url: string;
  label: string;
}

export const XROGA_PROFILE_AVATARS: ProfileAvatar[] = [
  { url: '/profiles/profile-1-hero.png', label: 'Profile 1' },
  { url: '/profiles/profile-2-astronaut.png', label: 'Profile 2' },
  { url: '/profiles/profile-3-cat.png', label: 'Profile 3' },
  { url: '/profiles/profile-4-hero.png', label: 'Profile 4' },
  { url: '/profiles/profile-5-oggy.png', label: 'Profile 5' },
];

export const XROGA_PROFILE_AVATAR_URLS: string[] = XROGA_PROFILE_AVATARS.map((a) => a.url);
