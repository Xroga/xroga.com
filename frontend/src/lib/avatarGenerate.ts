/** Generate a deterministic avatar URL from a user prompt (AI-style placeholder until image API ships) */

export type AvatarGenerateStyle = 'superhero' | 'self3d' | 'pixel';

export function generateAvatarUrl(prompt: string, style: AvatarGenerateStyle): string {
  const seed = encodeURIComponent(`${style}:${prompt.trim().slice(0, 120)}`);
  if (style === 'superhero') {
    return `https://api.dicebear.com/9.x/adventurer/png?seed=${seed}&size=512&backgroundColor=0ea5e9,c0dfff,1e3a8a`;
  }
  if (style === 'pixel') {
    return `https://api.dicebear.com/9.x/pixel-art/png?seed=${seed}&size=512&backgroundColor=1e293b,334155,64748b`;
  }
  return `https://api.dicebear.com/9.x/notionists/png?seed=${seed}&size=512&backgroundColor=e2e8f0,f8fafc,94a3b8`;
}
