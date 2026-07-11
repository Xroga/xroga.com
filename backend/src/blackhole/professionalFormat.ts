/** Professional markdown output — preserve structure, trim AI-isms, minimal emojis */

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

export function formatProfessionalMarkdown(text: string): string {
  let out = text.trim();

  // Remove excessive emojis (keep at most 1 per section — strip most)
  const emojiCount = (out.match(EMOJI_RE) ?? []).length;
  if (emojiCount > 2) {
    let kept = 0;
    out = out.replace(EMOJI_RE, (m) => (kept++ < 1 ? m : ''));
  }

  // Normalize heading spacing
  out = out.replace(/\n(#{1,4}\s)/g, '\n\n$1');
  out = out.replace(/\n{4,}/g, '\n\n\n');

  return out.trim();
}

export function hasMarkdownStructure(text: string): boolean {
  return /^#{1,4}\s/m.test(text) || /^\|.+\|/m.test(text) || /^[-*•]\s/m.test(text) || /^>\s/m.test(text);
}
