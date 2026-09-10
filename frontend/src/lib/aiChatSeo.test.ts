import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const read = (relative: string) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const page = read('../app/features/ai-chat/page.tsx');
const landing = read('../components/marketing/AiChatLanding.tsx');
const coding = read('../components/marketing/AiCodingAgentLanding.tsx');
const config = read('../../next.config.mjs');
const sitemap = read('../app/sitemap.ts');
const llms = read('../app/llms.txt/route.ts');
const features = read('../app/features/page.tsx');

test('/features/ai-chat is a self-canonical public page, not a redirect', () => {
  assert.match(page, /path: '\/features\/ai-chat'/);
  assert.doesNotMatch(config, /source: '\/features\/ai-chat'/);
  assert.equal((landing.match(/<h1\b/g) ?? []).length, 1);
  assert.match(sitemap, /\/features\/ai-chat/);
  assert.match(llms, /AI Chat: https:\/\/xroga\.com\/features\/ai-chat/);
  assert.match(features, /href="\/features\/ai-chat"/);
});

test('AI Chat and AI Coding Agent own different search intent and link to one another', () => {
  assert.match(page, /Search, Research, Analyze & Act/);
  assert.match(landing, /<h1>Xroga AI Chat<\/h1>/);
  assert.match(coding, /AI Coding Agent/);
  assert.doesNotMatch(landing, /<h1[^>]*>[^<]*AI Coding Agent/);
  assert.match(landing, /href="\/ai-coding-agent"/);
  assert.match(coding, /href: '\/features\/ai-chat'/);
});

test('AI Chat copy exposes evidence boundaries and does not market retired tools', () => {
  assert.match(landing, /General-purpose Chat browser automation and image generation are not currently marketed as working capabilities/);
  assert.match(landing, /X research stays X-only/);
  assert.match(landing, /Failures stay visible/);
});
