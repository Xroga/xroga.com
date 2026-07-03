import { synthesizeWithEdgeTts } from './edgeTts.js';

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function buildWelcomeSpeech(displayName?: string): string {
  const name =
    displayName && displayName.trim() && displayName.toLowerCase() !== 'there'
      ? displayName.trim().split(/\s+/)[0]
      : 'friend';
  const tg = timeGreeting();

  return (
    `Hey! I'm XROGA. [pause] ${tg}, ${name}! [pause] ` +
    `What can I help you with today? [pause] ` +
    `Here are our latest 2026 updates — voice talk with live web search, ` +
    `AI image and video generation, GitHub auto-deploy to Vercel and Netlify, ` +
    `and over seven hundred integrations. [pause] ` +
    `Tap the orb when you're ready to speak.`
  );
}

export async function synthesizeWelcome(displayName?: string): Promise<{ text: string; audio: Buffer }> {
  const text = buildWelcomeSpeech(displayName);
  const audio = await synthesizeWithEdgeTts(text);
  return { text, audio };
}
