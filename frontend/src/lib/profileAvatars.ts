/** Curated Xroga profile avatars — verified working URLs only */

export interface ProfileAvatar {
  url: string;
  label: string;
}

export const XROGA_PROFILE_AVATARS: ProfileAvatar[] = [
  { url: 'https://i.postimg.cc/MZ0yLCQd/image.png', label: 'Profile 1' },
  { url: 'https://i.postimg.cc/B6pnTBj2/image.png', label: 'Profile 2' },
  { url: 'https://i.postimg.cc/MT38ZPcN/image.png', label: 'Profile 3' },
  { url: 'https://i.postimg.cc/FHXXKJKB/image.png', label: 'Profile 4' },
  { url: 'https://i.postimg.cc/G2w3YhdJ/image.png', label: 'Profile 5' },
];

export const XROGA_PROFILE_AVATAR_URLS: string[] = XROGA_PROFILE_AVATARS.map((a) => a.url);
