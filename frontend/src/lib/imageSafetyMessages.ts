/** Islamic safety guidance — mirrors backend imageSafetyMessages.ts */

export interface ImageSafetyGuidance {
  title: string;
  quranArabic: string;
  quranTranslation: string;
  quranReference: string;
  guidance: string[];
  leakFallback: string;
  creativeAlternatives: string[];
}

export interface ImageBlockedOutput {
  type: 'image_blocked';
  prompt: string;
  reason: 'prompt_blocked' | 'image_blocked' | 'verification_failed';
  detail?: string;
  safety: ImageSafetyGuidance;
  followUps?: string[];
}

export const IMAGE_SAFETY_GUIDANCE: ImageSafetyGuidance = {
  title: 'Image blocked for your protection',
  quranArabic: 'وَلَا تَقْرَبُوا الزِّنَا ۖ إِنَّهُ كَانَ فَاحِشَةً وَسَاءَ سَبِيلًا',
  quranTranslation:
    'And do not approach unlawful sexual intercourse. Indeed, it is ever an immorality and is evil as a way.',
  quranReference: "Qur'an 17:32 (Surah Al-Isra)",
  guidance: [
    'Shaitan (Satan) beautifies adultery and shameful acts to mislead believers — stay mindful and turn away.',
    'Adultery and explicit imagery are forbidden in Islam and unlawful in most countries. Xroga does not promote them.',
    'Protect your heart, mind, and iman. What you see shapes your thoughts and spiritual health.',
    'We run AI safety checks before any image reaches you. If something inappropriate was generated, it is withheld.',
  ],
  leakFallback:
    'If an unsafe image ever slipped through, please do not look at it — viewing it is harmful to your soul and mental health. We are doing our best to block such content before you see it.',
  creativeAlternatives: [
    'Try a family-safe portrait, landscape, or Islamic geometric art style',
    'Generate a professional logo, poster, or YouTube thumbnail',
    'Ask for modest fashion, architecture, nature, or educational illustrations',
  ],
};
