/** Curated Xroga profile avatars — verified working URLs only (15 total) */

export interface ProfileAvatar {
  url: string;
  label: string;
  group: 'photo' | 'hero';
}

export const XROGA_PROFILE_AVATARS: ProfileAvatar[] = [
  // ── 5 verified profile photos (postimg) ──
  { url: 'https://i.postimg.cc/MZ0yLCQd/image.png', label: 'Profile 1', group: 'photo' },
  { url: 'https://i.postimg.cc/B6pnTBj2/image.png', label: 'Profile 2', group: 'photo' },
  { url: 'https://i.postimg.cc/MT38ZPcN/image.png', label: 'Profile 3', group: 'photo' },
  { url: 'https://i.postimg.cc/FHXXKJKB/image.png', label: 'Profile 4', group: 'photo' },
  { url: 'https://i.postimg.cc/G2w3YhdJ/image.png', label: 'Profile 5', group: 'photo' },

  // ── 10 hero 3D-style avatars (DiceBear — stable CDN) ──
  {
    url: 'https://api.dicebear.com/9.x/notionists/png?seed=Goku&size=256&backgroundColor=b6e3f4',
    label: 'Goku',
    group: 'hero',
  },
  {
    url: 'https://api.dicebear.com/9.x/notionists/png?seed=Batman&size=256&backgroundColor=c0aede',
    label: 'Batman',
    group: 'hero',
  },
  {
    url: 'https://api.dicebear.com/9.x/notionists/png?seed=Ben10&size=256&backgroundColor=ffd5dc',
    label: 'Ben 10',
    group: 'hero',
  },
  {
    url: 'https://api.dicebear.com/9.x/adventurer/png?seed=SpiderMan&size=256&backgroundColor=ffdfbf',
    label: 'Spider-Man',
    group: 'hero',
  },
  {
    url: 'https://api.dicebear.com/9.x/adventurer/png?seed=Superman&size=256&backgroundColor=d1d4f9',
    label: 'Superman',
    group: 'hero',
  },
  {
    url: 'https://api.dicebear.com/9.x/adventurer/png?seed=IronMan&size=256&backgroundColor=ffc9c9',
    label: 'Iron Man',
    group: 'hero',
  },
  {
    url: 'https://api.dicebear.com/9.x/lorelei/png?seed=Naruto&size=256&backgroundColor=c1f5d3',
    label: 'Naruto',
    group: 'hero',
  },
  {
    url: 'https://api.dicebear.com/9.x/lorelei/png?seed=Sonic&size=256&backgroundColor=fff3b0',
    label: 'Sonic',
    group: 'hero',
  },
  {
    url: 'https://api.dicebear.com/9.x/big-smile/png?seed=TheFlash&size=256&backgroundColor=fde68a',
    label: 'The Flash',
    group: 'hero',
  },
  {
    url: 'https://api.dicebear.com/9.x/big-smile/png?seed=WonderWoman&size=256&backgroundColor=fbcfe8',
    label: 'Wonder Woman',
    group: 'hero',
  },
];

/** Legacy flat list for callers that only need URLs */
export const XROGA_PROFILE_AVATAR_URLS: string[] = XROGA_PROFILE_AVATARS.map((a) => a.url);
