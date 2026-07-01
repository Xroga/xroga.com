/** Preserve literal user constraints (colors, characters) in enhanced image prompts */

const COLOR_WORDS =
  /\b(gray|grey|silver|white|black|red|blue|green|yellow|golden|orange|purple|pink|brown|beige|teal|cyan|magenta|monochrome|sepia)\b/gi;

const CHARACTER_HINTS: Array<{ test: RegExp; suffix: string }> = [
  {
    test: /\b(goku|dragon\s*ball|super\s*saiyan|saiyan)\b/i,
    suffix: 'Dragon Ball Z anime style, accurate Goku character design',
  },
  {
    test: /\b(tom\s+and\s+jerry|tom\s*&\s*jerry)\b/i,
    suffix: 'Classic Tom and Jerry cartoon characters Tom the cat and Jerry the mouse, Hanna-Barbera / MGM animation style, NOT any other character',
  },
  {
    test: /\bben\s*10\b|\bomnitrix\b/i,
    suffix: 'Ben 10 Cartoon Network animation style, accurate Ben 10 or Omnitrix alien',
  },
  {
    test: /\b(iron\s*man|tony\s*stark)\b/i,
    suffix: 'Marvel Iron Man cinematic photorealistic, accurate red and gold armor',
  },
];

export function extractColorModifiers(query: string): string[] {
  const matches = query.match(COLOR_WORDS) ?? [];
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}

/** Re-inject critical literals the LLM enhancer may drop. */
export function applyLiteralConstraints(enhanced: string, rawQuery: string): string {
  let result = enhanced.trim();
  const lower = rawQuery.toLowerCase();

  const colors = extractColorModifiers(rawQuery);
  for (const color of colors) {
    if (!new RegExp(`\\b${color}\\b`, 'i').test(result)) {
      result += `, ${color} color palette`;
    }
  }

  if (/\b(gray|grey|silver)\b/i.test(rawQuery) && /\b(super\s*saiyan|saiyan|goku)\b/i.test(rawQuery)) {
    result += '. CRITICAL: Super Saiyan hair must be SILVER-GRAY or white-gray, absolutely NOT golden yellow hair, gray monochrome aura';
  }

  if (/\bgolden\b/i.test(rawQuery) && !/\b(gray|grey|silver)\b/i.test(rawQuery)) {
    if (!/\bgolden\b/i.test(result)) result += ', golden tones';
  }

  for (const { test, suffix } of CHARACTER_HINTS) {
    if (test.test(rawQuery) && !test.test(result)) {
      result += `. ${suffix}`;
    }
  }

  if (/\b(tom\s+and\s+jerry|tom\s*&\s*jerry)\b/i.test(rawQuery)) {
    result = result.replace(/\bgoku\b/gi, 'Tom and Jerry');
    if (!/\btom\b/i.test(result)) {
      result = `Tom the cat and Jerry the mouse, ${result}`;
    }
  }

  if (/\bphotorealistic\b/i.test(rawQuery) && !/\bphotorealistic\b/i.test(result)) {
    result += ', photorealistic, ultra detailed';
  }

  if (/\banime\b/i.test(rawQuery) && !/\banime\b/i.test(result)) {
    result += ', anime art style';
  }

  if (/\bcartoon\b/i.test(rawQuery) && !/\bcartoon\b/i.test(result)) {
    result += ', cartoon animation style';
  }

  return result.replace(/\s+/g, ' ').trim();
}

/** Short directive prepended to enhancer LLM calls. */
export function literalDirective(rawQuery: string): string {
  const colors = extractColorModifiers(rawQuery);
  const parts = [`ORIGINAL USER REQUEST (follow exactly): "${rawQuery}"`];
  if (colors.length) parts.push(`Required colors: ${colors.join(', ')}`);
  parts.push('Do NOT change the subject. Do NOT substitute a different character.');
  return parts.join('\n');
}
